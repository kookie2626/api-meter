# API Meter 📊

A lightweight menubar (macOS) / system tray (Windows) app that tracks your AI API usage and costs in real time.

Never get surprised by unexpected API bills again!

## ✨ Features

- **Multi-Provider Support** — Track costs for **OpenAI**, **Anthropic (Claude)**, and **Google (Gemini)**
- **Model Breakdown** — See exactly which model (GPT-4o, Claude Sonnet, etc.) is consuming your budget
- **API Key Breakdown** — See per-API-key cost distribution for OpenAI and Anthropic (requires Admin API key)
- **Live Balance** — Remaining credits shown alongside monthly spend
- **Secure & Local** — All keys and session tokens are stored strictly on your machine. No external servers.
- **Auto-Updates** — Built-in OTA updates via GitHub Releases

## 📊 Providers & Data

| Provider | Balance | Monthly Spend | Model Breakdown | Key Breakdown |
|----------|---------|---------------|-----------------|---------------|
| OpenAI | ✅ | ✅ | ✅ | ✅ (Admin API, optional) |
| Anthropic | ✅ | ✅ | ✅ | ✅ (Admin API) |
| Gemini | ❌ | ✅ | ❌ | ❌ |

## 🔑 How to connect each provider

### OpenAI

**Step 1 — Browser login (required)**
Click **Login & Connect** in Settings and log in to [platform.openai.com](https://platform.openai.com). The app captures your session token automatically — no manual key entry needed. This provides monthly spend, model breakdown, and credit balance.

**Step 2 — Admin API Key (optional, for per-key breakdown)**
1. Go to [platform.openai.com](https://platform.openai.com) → **Settings → API Keys → Create new secret key**
2. Set the role to **Admin**
3. Paste the key into the **Admin API Key** field in Settings before clicking Login & Connect

> With an Admin API key, the app additionally shows how much each of your API keys has spent.

### Anthropic (Claude)

**Step 1 — Admin API Key (required)**
1. Go to [console.anthropic.com](https://console.anthropic.com) → **Settings → API Keys**
2. Create an **Admin** key (starts with `sk-ant-admin-...`)
3. Paste it into the **Admin API Key** field in Settings and click **Save API Key**

This provides monthly spend, model breakdown, and per-API-key cost distribution.

**Step 2 — Balance session (optional)**
After connecting, click **잔액 연결** in the connected accounts list and log in to the Anthropic console. This enables the credit balance display. If the session expires, click **잔액 갱신** to reconnect.

### Gemini

Click **Login & Connect** in Settings and log in to [aistudio.google.com](https://aistudio.google.com). The app reads your total monthly spend from the billing page.

## 🚀 Installation

### macOS

**Option 1 — One-line install (Recommended)**
```bash
curl -sL https://raw.githubusercontent.com/kookie2626/api-meter/main/install.sh | bash
```

**Option 2 — Manual**
1. Go to the [Releases page](../../releases/latest)
2. Download `API Meter-x.x.x-arm64.dmg`
3. Open the DMG and drag **API Meter** into your Applications folder

### Windows

1. Go to the [Releases page](../../releases/latest)
2. Download `API Meter Setup x.x.x.exe` (installer) or `API Meter x.x.x.exe` (portable)
3. Run the installer — the app appears in the system tray

## 🛠️ Development

Requires [Node.js](https://nodejs.org/).

```bash
git clone https://github.com/kookie2626/api-meter.git
cd api-meter
npm install
npm start
```

**Build for release:**
```bash
npm run dist:mac   # → .dmg + .zip
npm run dist:win   # → .exe installer + portable (run on Windows)
```

> Releases are built automatically via GitHub Actions when a version tag (`v*`) is pushed.

## 🔒 How it works

- **OpenAI** — Captures the session token from your browser login and calls the billing usage API for spend and balance. If an Admin API key is provided, additionally queries `/v1/organization/usage/completions` (grouped by `api_key_id`) to distribute costs across keys.
- **Anthropic** — Uses the Admin API (`/v1/organizations/cost_report`, `/v1/organizations/usage_report/messages`) for accurate model costs and per-key breakdowns. Credit balance is scraped from the console billing page via an optional browser session.
- **Gemini** — Reads total spend from the AI Studio billing page via your logged-in browser session. (Google does not provide a programmatic billing API.)

---

*Made for developers and AI power users who want to keep their API expenses in check.*
