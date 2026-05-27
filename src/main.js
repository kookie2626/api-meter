const { app, ipcMain, BrowserWindow } = require('electron');
const { menubar } = require('menubar');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const trayIcon = isWindows
    ? path.join(__dirname, '../assets/icon.ico')
    : isLinux
        ? path.join(__dirname, '../assets/icon.png')
        : path.join(__dirname, '../assets/iconTemplate.png');

const mb = menubar({
    index: `file://${__dirname}/index.html`,
    icon: trayIcon,
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
        transparent: !isWindows && !isLinux,
        backgroundColor: (isWindows || isLinux) ? '#1a1a2e' : undefined
    },
    preloadWindow: true
});

mb.on('ready', () => {
    console.log('Menubar app is ready.');

    // Windows / Linux: 작업표시줄에 앱 아이콘 표시 방지 (트레이 전용)
    if ((isWindows || isLinux) && mb.window) {
        mb.window.setSkipTaskbar(true);
    }

    // 투명 오버레이 창: 팝업 바깥 클릭 감지용 (macOS only)
    // blur 이벤트는 LSUIElement 앱에서 신뢰할 수 없어 오버레이로 대체
    if (!isWindows && !isLinux) {
        const { screen } = require('electron');
        const displays = screen.getAllDisplays();
        const minX = Math.min(...displays.map(d => d.bounds.x));
        const minY = Math.min(...displays.map(d => d.bounds.y));
        const maxX = Math.max(...displays.map(d => d.bounds.x + d.bounds.width));
        const maxY = Math.max(...displays.map(d => d.bounds.y + d.bounds.height));
        overlayWin = new BrowserWindow({
            x: minX, y: minY,
            width: maxX - minX, height: maxY - minY,
            transparent: true, frame: false, hasShadow: false,
            skipTaskbar: true, show: false,
            webPreferences: {
                preload: path.join(__dirname, 'capture-preload.js'),
                nodeIntegration: false, contextIsolation: true
            }
        });
        overlayWin.loadFile(path.join(__dirname, 'capture.html'));
        overlayWin.setAlwaysOnTop(true, 'floating'); // level 3, 팝업과 같은 레벨(moveTop으로 순서 제어)
    }

    let focusLostTimeout = null;

    mb.on('show', () => {
        if (focusLostTimeout) { clearTimeout(focusLostTimeout); focusLostTimeout = null; }
    });

    mb.on('after-show', () => {
        if (!isWindows && !isLinux && mb.window) {
            mb.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
            mb.window.setAlwaysOnTop(true, 'torn-off-menu'); // level 3
            if (overlayWin && !overlayWin.isDestroyed()) {
                overlayWin.setIgnoreMouseEvents(false);
                overlayWin.showInactive(); // key window 안 바꾸도록
            }
            mb.window.moveTop(); // 같은 level 3 내에서 팝업이 오버레이 위에 오도록
        }
    });

    mb.on('after-hide', () => {
        if (!isWindows && !isLinux) {
            if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
        }
    });

    mb.on('hide', () => {
        if (!isWindows && !isLinux && mb.window) {
            mb.window.setAlwaysOnTop(false);
        }
    });

    // 메뉴바 클릭 등 focus 이벤트로 닫히는 경우 대비 (보조)
    mb.on('focus-lost', () => {
        if (focusLostTimeout) clearTimeout(focusLostTimeout);
        focusLostTimeout = setTimeout(() => {
            focusLostTimeout = null;
            mb.hideWindow();
        }, 150);
    });

    // 자동 새로고침 시작
    startAutoRefresh();

    // Check for updates on startup
    autoUpdater.checkForUpdatesAndNotify();
    
    // Check for updates every 7 days (7 * 24 * 60 * 60 * 1000 = 604800000 ms)
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 604800000);
    
    // Optional: Log update events
    autoUpdater.on('update-available', () => console.log('Update available.'));
    autoUpdater.on('update-not-available', () => {
        console.log('Update not available.');
        if (mb.window) mb.window.webContents.send('update-not-available');
    });
    autoUpdater.on('update-downloaded', () => {
        console.log('Update downloaded. It will be installed on restart.');
        if (mb.window) {
            mb.window.webContents.send('update-downloaded');
        }
    });
});

ipcMain.handle('check-for-update', () => {
    return autoUpdater.checkForUpdatesAndNotify();
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

// 자동 새로고침
let autoRefreshTimer = null;
let overlayWin = null;

function startAutoRefresh() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
    const settings = getSettings();
    const intervalMin = settings.refreshInterval;
    if (!intervalMin || intervalMin <= 0) return;
    autoRefreshTimer = setInterval(async () => {
        try {
            console.log('[AutoRefresh] Refreshing...');
            const data = await fetchAllData();
            if (mb.window && !mb.window.isDestroyed()) {
                mb.window.webContents.send('usage-data-updated', data);
            }
        } catch (err) {
            console.error('[AutoRefresh] Error:', err.message);
        }
    }, intervalMin * 60 * 1000);
    console.log(`[AutoRefresh] Interval set: ${intervalMin}min`);
}

async function fetchAllData() {
    const settings = getSettings();
    const keys = settings.keys || [];
    
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    // 각 프로바이더를 병렬로 실행하는 함수들
    async function fetchOpenAI(keyObj) {
        let spend = 0, balance = null, subModels = [], subKeys = [];
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

        // Admin API key: API 키별 토큰 분포 조회 → 비용 비례 배분
        if (keyObj.adminKey) {
            try {
                const adminHeaders = { 'Authorization': `Bearer ${keyObj.adminKey}` };
                const startTs = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
                const endTs = Math.floor(Date.now() / 1000);

                const fetchUsagePage = async () => {
                    const results = [];
                    let nextPage = null;
                    do {
                        const params = new URLSearchParams({ start_time: startTs, end_time: endTs, bucket_width: '1d', limit: 31 });
                        params.append('group_by', 'model');
                        params.append('group_by', 'api_key_id');
                        if (nextPage) params.set('page', nextPage);
                        const res = await fetch(`https://api.openai.com/v1/organization/usage/completions?${params}`, { headers: adminHeaders });
                        if (!res.ok) { console.error(`[OpenAI] Admin usage error: ${res.status}`); break; }
                        const json = await res.json();
                        (json.data || []).forEach(b => results.push(...(b.results || [])));
                        nextPage = json.has_more ? json.next_page : null;
                    } while (nextPage);
                    return results;
                };

                const [keyNameMap, usageItems] = await Promise.all([
                    (async () => {
                        try {
                            const map = {};
                            // 프로젝트 목록 조회
                            const projRes = await fetch('https://api.openai.com/v1/organization/projects?limit=100', { headers: adminHeaders });
                            if (!projRes.ok) return map;
                            const projJson = await projRes.json();
                            const projects = projJson.data || [];
                            // 각 프로젝트의 API 키 목록 병렬 조회
                            await Promise.all(projects.map(async proj => {
                                const keyRes = await fetch(`https://api.openai.com/v1/organization/projects/${proj.id}/api_keys?limit=100`, { headers: adminHeaders });
                                if (!keyRes.ok) return;
                                const keyJson = await keyRes.json();
                                (keyJson.data || []).forEach(k => { map[k.id] = k.name || k.id; });
                            }));
                            return map;
                        } catch(e) { return {}; }
                    })(),
                    fetchUsagePage().catch(() => [])
                ]);

                // 모델별 · 키별 가중 토큰 합산
                const tokensByModelAndKey = {};
                usageItems.forEach(item => {
                    const model = item.model, keyId = item.api_key_id;
                    if (!model || !keyId) return;
                    const w = (item.input_tokens || 0) + 5 * (item.output_tokens || 0)
                            + 0.8 * (item.input_cached_tokens || 0);
                    if (!tokensByModelAndKey[model]) tokensByModelAndKey[model] = {};
                    tokensByModelAndKey[model][keyId] = (tokensByModelAndKey[model][keyId] || 0) + w;
                });

                // billing/usage 모델명 정규화: "gpt-4o-2024-08-06, input" → "gpt-4o-2024-08-06"
                const normalizeModel = name => name.replace(/,\s*(input|output|context|generation|image|audio|cached).*$/i, '').trim();

                // 모델별 비용 × 토큰 비율 → 키별 비용
                const keyMap = {};
                subModels.forEach(({ name: modelName, spend: modelCost }) => {
                    const keyTokens = tokensByModelAndKey[normalizeModel(modelName)] || {};
                    const total = Object.values(keyTokens).reduce((s, t) => s + t, 0);
                    if (total === 0) return;
                    Object.entries(keyTokens).forEach(([keyId, tokens]) => {
                        const keyName = keyNameMap[keyId] || keyId;
                        keyMap[keyName] = (keyMap[keyName] || 0) + modelCost * (tokens / total);
                    });
                });

                subKeys = Object.entries(keyMap)
                    .map(([name, cost]) => ({ name, spend: cost }))
                    .sort((a, b) => b.spend - a.spend);

                console.log(`[OpenAI] Keys: ${subKeys.length}`);
            } catch (err) {
                console.error('[OpenAI] Admin API error:', err.message);
            }
        }

        return { name: 'OpenAI', spend, balance, subModels, subKeys };
    }

    async function fetchAnthropic(keyObj) {
        let spend = 0, balance = null, subModels = [], subKeys = [];

        // Legacy: session-based browser scraping
        if (keyObj.isCookie) {
            let win = null;
            try {
                win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
                console.log('[Anthropic] Fetching via session...');
                await win.loadURL('https://console.anthropic.com/settings/billing');
                await new Promise(r => setTimeout(r, 3000));

                const text = await win.webContents.executeJavaScript('document.body.innerText');

                const balanceMatch = text.match(/US?\$\s*([\d,]+\.?\d*)/i) ||
                                     text.match(/(?:USD|크레딧|잔액)\s*\$?([\d,]+\.?\d*)/i);
                if (balanceMatch) {
                    balance = parseFloat(balanceMatch[1].replace(',', ''));
                    console.log(`[Anthropic] Balance: $${balance}`);
                }

                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].match(/(Usage this month|Current month|사용량|이번 달)/i)) {
                        for (let j = 0; j <= 2; j++) {
                            if (lines[i+j]) {
                                const m = lines[i+j].match(/\$([\d,]+\.?\d*)/);
                                if (m) {
                                    const val = parseFloat(m[1].replace(/,/g, ''));
                                    if (!balance || val < balance) spend = val;
                                    break;
                                }
                            }
                        }
                        if (spend > 0) break;
                    }
                }
            } catch (err) {
                console.error('[Anthropic] Error:', err.message);
            } finally {
                if (win && !win.isDestroyed()) win.close();
            }
            return { name: 'Anthropic', spend, balance };
        }

        // Admin API key path
        try {
            console.log('[Anthropic] Fetching via Admin API...');
            const now = new Date();
            const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('.')[0] + 'Z';
            const endDate = now.toISOString().split('.')[0] + 'Z';
            const headers = { 'x-api-key': keyObj.key, 'anthropic-version': '2023-06-01' };

            // API 키 이름 조회 + 비용 리포트 병렬 실행
            const [keyNameMap, allResults] = await Promise.all([
                // API 키 ID → 이름 매핑
                fetch('https://api.anthropic.com/v1/organizations/api_keys?limit=100', { headers })
                    .then(r => r.ok ? r.json() : { data: [] })
                    .then(json => {
                        const map = {};
                        (json.data || []).forEach(k => { map[k.id] = k.name || k.id; });
                        return map;
                    })
                    .catch(() => ({})),

                // cost_report(description) + usage_report(model+api_key_id) 병렬 조회
                (async () => {
                    const fetchCost = async () => {
                        const results = [];
                        let nextPage = null;
                        do {
                            const params = new URLSearchParams({ starting_at: startDate, ending_at: endDate });
                            params.append('group_by[]', 'description');
                            if (nextPage) params.set('page', nextPage);
                            const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${params}`, { headers });
                            if (!res.ok) break;
                            const json = await res.json();
                            (json.data || []).forEach(b => results.push(...(b.results || [])));
                            nextPage = json.has_more ? json.next_page : null;
                        } while (nextPage);
                        return results;
                    };

                    const fetchUsage = async () => {
                        const results = [];
                        let nextPage = null;
                        do {
                            const params = new URLSearchParams({ starting_at: startDate, ending_at: endDate, bucket_width: '1d' });
                            params.append('group_by[]', 'model');
                            params.append('group_by[]', 'api_key_id');
                            if (nextPage) params.set('page', nextPage);
                            const res = await fetch(`https://api.anthropic.com/v1/organizations/usage_report/messages?${params}`, { headers });
                            if (!res.ok) { console.error(`[Anthropic] usage_report error: ${res.status}`); break; }
                            const json = await res.json();
                            (json.data || []).forEach(b => results.push(...(b.results || [])));
                            nextPage = json.has_more ? json.next_page : null;
                        } while (nextPage);
                        return results;
                    };

                    const [byDesc, byUsage] = await Promise.all([fetchCost(), fetchUsage().catch(() => [])]);
                    return { byDesc, byUsage };
                })()
            ]);

            const { byDesc, byUsage } = allResults;

            // 모델별 비용 (cost_report 기준 - 정확)
            const modelMap = {};
            byDesc.forEach(item => {
                const costUsd = parseFloat(item.amount || 0) / 100;
                spend += costUsd;
                if (costUsd <= 0) return;
                const modelName = item.model || 'Unknown';
                modelMap[modelName] = (modelMap[modelName] || 0) + costUsd;
            });

            subModels = Object.entries(modelMap)
                .map(([name, cost]) => ({ name, spend: cost }))
                .sort((a, b) => b.spend - a.spend);

            // 키별 비용 = 모델별 비용 × 키별 토큰 비율 (usage_report 기준)
            // weighted = input + 5*output (output이 ~5배 비싸므로 가중치 적용)
            const tokensByModelAndKey = {};
            byUsage.forEach(item => {
                const model = item.model, keyId = item.api_key_id;
                if (!model || !keyId) return;
                const cacheCreate = (item.cache_creation?.ephemeral_1h_input_tokens || 0)
                                  + (item.cache_creation?.ephemeral_5m_input_tokens || 0);
                const w = (item.uncached_input_tokens || 0) + 5 * (item.output_tokens || 0)
                        + 0.8 * cacheCreate + 0.1 * (item.cache_read_input_tokens || 0);
                if (!tokensByModelAndKey[model]) tokensByModelAndKey[model] = {};
                tokensByModelAndKey[model][keyId] = (tokensByModelAndKey[model][keyId] || 0) + w;
            });

            const keyMap = {};
            subModels.forEach(({ name: modelName, spend: modelCost }) => {
                const keyTokens = tokensByModelAndKey[modelName] || {};
                const total = Object.values(keyTokens).reduce((s, t) => s + t, 0);
                if (total === 0) return;
                Object.entries(keyTokens).forEach(([keyId, tokens]) => {
                    const keyName = keyNameMap[keyId] || keyId;
                    keyMap[keyName] = (keyMap[keyName] || 0) + modelCost * (tokens / total);
                });
            });

            subKeys = Object.entries(keyMap)
                .map(([name, cost]) => ({ name, spend: cost }))
                .sort((a, b) => b.spend - a.spend);

            console.log(`[Anthropic] spend: $${spend.toFixed(4)}, models: ${subModels.length}, keys: ${subKeys.length}`);
        } catch (err) {
            console.error('[Anthropic] API error:', err.message);
        }

        // 잔액: cookieSession이 있을 때만 스크래핑 시도 (isCookie 경로는 위에서 이미 return)
        if (keyObj.cookieSession) {
            let win = null;
            try {
                win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
                await win.loadURL('https://console.anthropic.com/settings/billing');
                await new Promise(r => setTimeout(r, 3000));
                const text = await win.webContents.executeJavaScript('document.body.innerText');

                const balanceMatch = text.match(/US?\$\s*([\d,]+\.?\d*)/i) ||
                                     text.match(/(?:USD|크레딧|잔액)\s*\$?([\d,]+\.?\d*)/i);
                if (balanceMatch) {
                    balance = parseFloat(balanceMatch[1].replace(',', ''));
                    console.log(`[Anthropic] Balance from session: $${balance}`);
                } else {
                    console.log('[Anthropic] Balance: session expired, re-login needed');
                }
            } catch (err) {
                console.log('[Anthropic] Balance scrape skipped (no session)');
            } finally {
                if (win && !win.isDestroyed()) win.close();
            }
        }

        return { name: 'Anthropic', spend, balance, subModels, subKeys };
    }

    async function fetchGemini(keyObj) {
        let spend = 0;
        let win = null;
        try {
            win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false } });
            console.log('[Gemini] Fetching...');
            await win.loadURL('https://aistudio.google.com/app/spend');
            await new Promise(r => setTimeout(r, 4000));

            const text = await win.webContents.executeJavaScript('document.body.innerText');

            const lines = text.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('총비용') || lines[i].toLowerCase().includes('total cost')) {
                    if (lines[i+1] && (lines[i+1].includes('사용 데이터가 없습니다') || lines[i+1].toLowerCase().includes('no usage'))) break;
                    for (let j = 1; j <= 3; j++) {
                        if (lines[i+j]) {
                            const match = lines[i+j].match(/([\$₩])\s*([\d,]+\.?\d*)/);
                            if (match) {
                                let val = parseFloat(match[2].replace(/,/g, ''));
                                if (match[1] === '₩') val = val / 1350;
                                spend = val;
                                break;
                            }
                        }
                    }
                    break;
                }
            }
            console.log(`[Gemini] Spend: $${spend}`);
        } catch (err) {
            console.error('[Gemini] Error:', err.message);
        } finally {
            if (win && !win.isDestroyed()) win.close();
        }
        return { name: 'Gemini', spend, balance: null };
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

    const data = { total_spend: 0.0, models: [], fetchedAt: Date.now() };

    results.forEach(r => {
        const model = { name: r.name, spend: r.spend };
        if (r.balance !== null) model.balance = r.balance;
        if (r.subModels && r.subModels.length > 0) model.subModels = r.subModels;
        if (r.subKeys && r.subKeys.length > 0) model.subKeys = r.subKeys;
        data.models.push(model);
        data.total_spend += r.spend;
    });

    data.models.sort((a, b) => b.spend - a.spend);
    return data;
}

ipcMain.handle('get-usage-data', () => fetchAllData());

ipcMain.handle('get-refresh-interval', () => {
    return getSettings().refreshInterval || 0;
});

ipcMain.handle('save-refresh-interval', (event, minutes) => {
    const settings = getSettings();
    settings.refreshInterval = minutes;
    saveSettings(settings);
    startAutoRefresh();
    return true;
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
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (e) {
        console.error('[Settings] Failed to save:', e.message);
    }
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

        // OpenAI는 격리된 파티션 사용 — 매번 완전 초기화로 자동로그인 방지
        const partition = provider === 'OpenAI' ? 'auth-openai' : undefined;
        const authWin = new BrowserWindow({
            width: 800,
            height: 800,
            webPreferences: {
                nodeIntegration: false,
                ...(partition ? { partition } : {})
            },
            title: `Login to ${provider}`
        });

        console.log(`[Auth] Starting authentication for: ${provider}`);

        if (provider === 'OpenAI') {
            // OpenAI: 격리 파티션의 모든 스토리지 초기화 후 로그인 페이지 로드
            const startOpenAIAuth = () => {
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
            };
            authWin.webContents.session.clearStorageData().catch(() => {}).then(startOpenAIAuth);
            
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
ipcMain.on('click-outside', () => {
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setIgnoreMouseEvents(true);
    mb.hideWindow();
});

ipcMain.handle('hide-app', () => {
    mb.hideWindow();
});

ipcMain.handle('resize-window', (event, width, height) => {
    if (!mb.window) return;
    mb.window.setContentSize(Math.ceil(width), Math.ceil(height));
    if (mb.tray) {
        const { screen } = require('electron');
        const trayBounds = mb.tray.getBounds();
        const winBounds = mb.window.getBounds();
        const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
        const screenHeight = display.bounds.height + display.bounds.y;
        const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);
        // 작업표시줄이 하단(Windows 기본)이면 트레이 위에, 상단(macOS)이면 트레이 아래에 배치
        const y = trayBounds.y > screenHeight / 2
            ? trayBounds.y - winBounds.height - 4
            : trayBounds.y + trayBounds.height + 4;
        mb.window.setPosition(x, y, false);
    }
});

ipcMain.handle('quit-app', () => {
    app.quit();
});

ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall();
});
