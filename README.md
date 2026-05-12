# API Meter 📊

A lightweight menubar (macOS) / system tray (Windows) app that tracks your AI API usage and costs in real time.

Never get surprised by unexpected API bills again!

## ✨ Features

- **Multi-Provider Support** — Track costs for **OpenAI**, **Anthropic (Claude)**, and **Google (Gemini)**
- **Model Breakdown** — See exactly which model (GPT-4o, Claude Sonnet, etc.) is consuming your budget
- **API Key Breakdown** — For Anthropic, see per-API-key cost distribution (requires Admin API key)
- **Live Balance** — Remaining credits shown alongside monthly spend
- **Secure & Local** — API keys and session tokens are stored strictly on your machine. No external servers.
- **Auto-Updates** — Built-in OTA updates via GitHub Releases

## 📸 Providers & Data

| Provider | Balance | Monthly Spend | Model Breakdown | Key Breakdown |
|----------|---------|---------------|-----------------|---------------|
| OpenAI | ✅ | ✅ | ✅ | ❌ |
| Anthropic | ✅ | ✅ | ✅ | ✅ (Admin API) |
| Gemini | ❌ | ✅ | ❌ | ❌ |

## 🔑 How to connect each provider

### OpenAI
Click **Connect** and log in to [platform.openai.com](https://platform.openai.com). The app captures your session token automatically — no manual key entry needed.

### Anthropic (Claude)
Requires an **Admin API key** (not a regular API key):
1. Go to [console.anthropic.com](https://console.anthropic.com) → **Settings → API Keys**
2. Create an **Admin** key (the key starts with `sk-ant-admin-...`)
3. Paste it into the app's Settings

> With an Admin API key, the app fetches model-level costs via the [Anthropic Admin API](https://docs.anthropic.com/en/api/admin-api) and shows per-API-key usage breakdown for your organization.

### Gemini
Click **Connect** and log in to [aistudio.google.com](https://aistudio.google.com). The app reads your total monthly spend from the billing page.

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
3. Run the installer — the app will appear in your system tray

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

> To publish to GitHub Releases, set the `GH_TOKEN` environment variable before building.

## 🔒 How it works

- **OpenAI** — Captures the session token from your browser login and calls the official billing usage API
- **Anthropic** — Uses the Admin API (`/v1/organizations/cost_report`, `/v1/organizations/usage_report/messages`) for accurate model costs and key-level breakdowns. Balance is read from the console billing page via your logged-in session.
- **Gemini** — Reads total spend from the AI Studio billing page via your logged-in session. (Google does not provide a programmatic billing API)

---

*Made for developers and AI power users who want to keep their API expenses in check.*
