const { app, ipcMain, BrowserWindow } = require('electron');
const { menubar } = require('menubar');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const mb = menubar({
    index: `file://${__dirname}/index.html`,
    icon: path.join(__dirname, '../assets/iconTemplate.png'),
    browserWindow: {
        width: 340,
        height: 500,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        resizable: false,
        frame: false,
        transparent: true
    },
    preloadWindow: true
});

mb.on('ready', () => {
    console.log('Menubar app is ready.');
    
    // Check for updates on startup
    autoUpdater.checkForUpdatesAndNotify();
    
    // Check for updates every 7 days (7 * 24 * 60 * 60 * 1000 = 604800000 ms)
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 604800000);
    
    // Optional: Log update events
    autoUpdater.on('update-available', () => console.log('Update available.'));
    autoUpdater.on('update-downloaded', () => {
        console.log('Update downloaded. It will be installed on restart.');
        if (mb.window) {
            mb.window.webContents.send('update-downloaded');
        }
    });
});

// =============================================
// 핵심 유틸: 토큰에서 순수 세션값만 추출
// =============================================
function extractToken(raw) {
    // "Bearer sess-xxx" → "sess-xxx"
    // "sess-xxx" → "sess-xxx"
    if (!raw) return '';
    return raw.replace(/^Bearer\s+/i, '').trim();
}

// 캐시: 마지막 조회 결과를 저장해 즉시 표시
let lastUsageData = null;

ipcMain.handle('get-usage-data', async () => {
    const settings = getSettings();
    const keys = settings.keys || [];
    
    // 캐시가 있으면 즉시 반환하고, 백그라운드에서 갱신
    // (첫 요청이거나 5분 이상 지났으면 동기적으로 조회)
    
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    // 각 프로바이더를 병렬로 실행하는 함수들
    async function fetchOpenAI(keyObj) {
        let spend = 0, balance = null, subModels = [];
        try {
            const pureToken = extractToken(keyObj.key);
            const authStr = `Bearer ${pureToken}`;
            console.log(`[OpenAI] Fetching...`);
            
            // 사용량 + 크레딧을 동시에 조회
            const [usageRes, creditRes] = await Promise.all([
                fetch(`https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`, {
                    headers: { 'Authorization': authStr }
                }),
                fetch('https://api.openai.com/dashboard/billing/credit_grants', {
                    headers: { 'Authorization': authStr }
                }).catch(() => null)
            ]);
            
            if (usageRes.ok) {
                const json = await usageRes.json();
                spend = (json.total_usage || 0) / 100;
                
                const modelMap = {};
                if (json.daily_costs) {
                    json.daily_costs.forEach(day => {
                        if (day.line_items) {
                            day.line_items.forEach(item => {
                                const name = item.name || 'Other';
                                const cost = (item.cost || 0) / 100;
                                if (cost > 0) modelMap[name] = (modelMap[name] || 0) + cost;
                            });
                        }
                    });
                }
                subModels = Object.entries(modelMap)
                    .map(([name, cost]) => ({ name, spend: cost }))
                    .sort((a, b) => b.spend - a.spend);
                console.log(`[OpenAI] Usage: $${spend.toFixed(4)}, Models: ${subModels.length}`);
            }
            
            if (creditRes && creditRes.ok) {
                const creditJson = await creditRes.json();
                balance = creditJson.total_available || 0;
                console.log(`[OpenAI] Balance: $${balance}`);
            } else {
                // fallback
                try {
                    const subRes = await fetch('https://api.openai.com/v1/dashboard/billing/subscription', {
                        headers: { 'Authorization': authStr }
                    });
                    if (subRes.ok) {
                        const subJson = await subRes.json();
                        balance = subJson.hard_limit_usd || null;
                    }
                } catch (e) {}
            }
        } catch (err) {
            console.error(`[OpenAI] Error:`, err.message);
        }
        return { name: 'OpenAI', spend, balance, subModels };
    }

    async function fetchAnthropic(keyObj) {
        let spend = 0, balance = null;
        try {
            const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
            console.log('[Anthropic] Fetching...');
            await win.loadURL('https://console.anthropic.com/settings/billing');
            await new Promise(r => setTimeout(r, 3000)); // 5초 → 3초
            
            const text = await win.webContents.executeJavaScript('document.body.innerText');
            if (!win.isDestroyed()) win.close();
            
            const balanceMatch = text.match(/US?\$\s*([\d,]+\.?\d*)/i) ||
                                 text.match(/(?:USD|크레딧|잔액)\s*\$?([\d,]+\.?\d*)/i);
            if (balanceMatch) {
                balance = parseFloat(balanceMatch[1].replace(',', ''));
                console.log(`[Anthropic] Balance: $${balance}`);
            }

            const spendMatch = text.match(/(?:Usage this month|Current month|사용량|이번 달)\s*[^\$]*\$?\s*([\d,]+\.?\d*)/i) ||
                               text.match(/US?\$\s*([\d,]+\.?\d*)/i); // fallback
            if (spendMatch && spendMatch[1]) {
                // If it finds a generic $ value that is small, it might be spend
                const val = parseFloat(spendMatch[1].replace(',', ''));
                if (!balance || val < balance) spend = val; 
            }
        } catch (err) {
            console.error('[Anthropic] Error:', err.message);
        }
        return { name: 'Anthropic', spend, balance };
    }

    async function fetchGemini(keyObj) {
        let spend = 0, balance = null;
        try {
            const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
            console.log('[Gemini] Fetching...');
            await win.loadURL('https://aistudio.google.com/apikey');
            await new Promise(r => setTimeout(r, 3000)); // 5초 → 3초
            
            const text = await win.webContents.executeJavaScript('document.body.innerText');
            if (!win.isDestroyed()) win.close();
            
            const balanceMatch = text.match(/\$([\d,]+\.?\d*)/);
            if (balanceMatch) {
                balance = parseFloat(balanceMatch[1].replace(',', ''));
                console.log(`[Gemini] Balance: $${balance}`);
            }
            const usageMatch = text.match(/(?:usage|사용량|청구|요금)[^\$]*\$?\s*([\d,]+\.?\d*)/i);
            if (usageMatch) {
                spend = parseFloat(usageMatch[1].replace(',', ''));
                console.log(`[Gemini] Spend: $${spend}`);
            }
        } catch (err) {
            console.error('[Gemini] Error:', err.message);
        }
        return { name: 'Gemini', spend, balance };
    }

    // 모든 프로바이더를 병렬로 실행
    const fetchPromises = keys.map(keyObj => {
        if (keyObj.provider === 'OpenAI') return fetchOpenAI(keyObj);
        if (keyObj.provider === 'Anthropic') return fetchAnthropic(keyObj);
        if (keyObj.provider === 'Gemini') return fetchGemini(keyObj);
        return Promise.resolve({ name: keyObj.provider, spend: 0, balance: null });
    });

    console.time('[Perf] Total fetch');
    const results = await Promise.all(fetchPromises);
    console.timeEnd('[Perf] Total fetch');

    const data = {
        total_spend: 0.0,

        models: []
    };

    results.forEach(r => {
        const model = { name: r.name, spend: r.spend };
        if (r.balance !== null) model.balance = r.balance;
        if (r.subModels && r.subModels.length > 0) model.subModels = r.subModels;
        data.models.push(model);
        data.total_spend += r.spend;
    });
    
    data.models.sort((a, b) => b.spend - a.spend);
    lastUsageData = data;
    return data;
});

// =============================================
// Settings 관리
// =============================================
function getSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
        }
    } catch (e) {}
    return { keys: [] };
}

function saveSettings(settings) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

ipcMain.handle('load-keys', () => {
    return getSettings().keys || [];
});

ipcMain.handle('save-keys', (event, keys) => {
    const settings = getSettings();
    settings.keys = keys;
    saveSettings(settings);
    return true;
});



// =============================================
// 로그인 인증 (OpenAI = 세션토큰 캡처, Anthropic = URL 감지)
// =============================================
ipcMain.handle('authenticate-provider', async (event, provider, alias) => {
    return new Promise((resolve) => {
        let resolved = false;
        
        const authWin = new BrowserWindow({
            width: 800,
            height: 800,
            webPreferences: {
                nodeIntegration: false
            },
            title: `Login to ${provider}`
        });

        console.log(`[Auth] Starting authentication for: ${provider}`);

        if (provider === 'OpenAI') {
            // OpenAI: 네트워크 요청에서 세션 토큰 캡처
            const filter = { urls: ['*://*.openai.com/*'] };
            authWin.webContents.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
                if (resolved) {
                    callback({ requestHeaders: details.requestHeaders });
                    return;
                }
                const authHeader = details.requestHeaders['Authorization'] || details.requestHeaders['authorization'];
                if (authHeader && authHeader.includes('sess-')) {
                    resolved = true;
                    callback({ requestHeaders: details.requestHeaders });
                    console.log(`[Auth] OpenAI session token captured!`);
                    setTimeout(() => { if (!authWin.isDestroyed()) authWin.close(); }, 100);
                    resolve({ provider, alias, token: authHeader });
                    return;
                }
                callback({ requestHeaders: details.requestHeaders });
            });
            authWin.loadURL('https://platform.openai.com/login');
            
        } else if (provider === 'Anthropic') {
            // Anthropic: 페이지 타이틀 + URL 폴링으로 로그인 완료 감지
            authWin.loadURL('https://console.anthropic.com/login');
            
            console.log(`[Auth] Anthropic: polling started`);
            
            // 페이지 타이틀이 바뀌면 체크
            authWin.webContents.on('page-title-updated', (e, title) => {
                console.log(`[Auth] Anthropic title changed: "${title}"`);
                if (resolved) return;
                if (title.includes('Dashboard') || title.includes('Console') || title.includes('Claude')) {
                    if (!title.toLowerCase().includes('login') && !title.toLowerCase().includes('sign')) {
                        resolved = true;
                        console.log(`[Auth] Anthropic login SUCCESS via title: "${title}"`);
                        setTimeout(() => { if (!authWin.isDestroyed()) authWin.close(); }, 300);
                        resolve({ provider, alias, token: 'session_active', isCookie: true });
                    }
                }
            });
            
            // 백업: 2초마다 URL 폴링
            const pollTimer = setInterval(() => {
                if (resolved || authWin.isDestroyed()) {
                    clearInterval(pollTimer);
                    return;
                }
                try {
                    const url = authWin.webContents.getURL();
                    const title = authWin.webContents.getTitle();
                    console.log(`[Auth Poll] URL: ${url} | Title: ${title}`);
                    
                    // 로그인 페이지가 아닌 console.anthropic.com 또는 platform.claude.com 이면 성공
                    const isAnthropicConsole = url.startsWith('https://console.anthropic.com') || url.startsWith('https://platform.claude.com');
                    if (isAnthropicConsole && 
                        !url.includes('/login') && 
                        !url.includes('/oauth') &&
                        !url.includes('/authorize') &&
                        !url.includes('accounts.google.com')) {
                        resolved = true;
                        clearInterval(pollTimer);
                        console.log(`[Auth] Anthropic login SUCCESS via poll! URL: ${url}`);
                        setTimeout(() => { if (!authWin.isDestroyed()) authWin.close(); }, 300);
                        resolve({ provider, alias, token: 'session_active', isCookie: true });
                    }
                } catch (e) {
                    clearInterval(pollTimer);
                }
            }, 2000);
            
            // 창 닫힐 때 타이머 정리
            authWin.on('closed', () => {
                clearInterval(pollTimer);
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
            });
            return; // early return
        } else if (provider === 'Gemini') {
            // Gemini: Google AI Studio 로그인 감지
            authWin.loadURL('https://aistudio.google.com');
            
            console.log(`[Auth] Gemini: polling started`);
            
            const pollTimer = setInterval(() => {
                if (resolved || authWin.isDestroyed()) {
                    clearInterval(pollTimer);
                    return;
                }
                try {
                    const url = authWin.webContents.getURL();
                    const title = authWin.webContents.getTitle();
                    console.log(`[Auth Poll] Gemini URL: ${url} | Title: ${title}`);
                    
                    // aistudio.google.com의 메인 페이지에 도착하면 로그인 성공
                    if (url.startsWith('https://aistudio.google.com') && 
                        !url.includes('/signin') &&
                        !url.includes('accounts.google.com')) {
                        // 타이틀에 "Google AI Studio"가 포함되면 확실히 로그인됨
                        if (title.includes('Google AI') || title.includes('AI Studio') || title.includes('Gemini')) {
                            resolved = true;
                            clearInterval(pollTimer);
                            console.log(`[Auth] Gemini login SUCCESS! URL: ${url}`);
                            setTimeout(() => { if (!authWin.isDestroyed()) authWin.close(); }, 300);
                            resolve({ provider, alias, token: 'session_active', isCookie: true });
                        }
                    }
                } catch (e) {
                    clearInterval(pollTimer);
                }
            }, 2000);
            
            authWin.on('closed', () => {
                clearInterval(pollTimer);
                if (!resolved) {
                    resolved = true;
                    resolve(null);
                }
            });
            return;
        } else {
            authWin.close();
            resolve(null);
            return;
        }

        // OpenAI 전용 closed 핸들러
        authWin.on('closed', () => {
            if (!resolved) {
                resolved = true;
                resolve(null);
            }
        });
    });
});

// =============================================
// 윈도우 관리
// =============================================
ipcMain.handle('hide-app', () => {
    mb.hideWindow();
});

ipcMain.handle('resize-window', (event, width, height) => {
    if (mb.window) {
        mb.window.setContentSize(Math.ceil(width), Math.ceil(height));
    }
});

ipcMain.handle('quit-app', () => {
    app.quit();
});

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
});
