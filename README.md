# API Meter 📊

A sleek, lightweight macOS menubar application designed to track your API usage and costs across major AI providers in one convenient place. 

Never get surprised by unexpected API bills again!

## ✨ Features
- **Multi-Provider Support**: Seamlessly track costs for **OpenAI**, **Anthropic (Claude)**, and **Google (Gemini)**.
- **Secure by Design**: Your API keys and session tokens are stored **strictly locally** on your machine. No external servers or cloud databases are used.
- **Always Accessible**: Lives quietly in your macOS menubar. Click the icon to instantly see your total spend and remaining credits.
- **Auto-Updates**: Built-in OTA (Over-The-Air) updates. The app automatically checks for new versions and lets you update with a single click.

## 🚀 Installation (For Users)

### Option 1: One-line Terminal Install (Recommended)
Open your terminal and paste this command:
```bash
curl -sL https://raw.githubusercontent.com/kookie2626/api-meter/main/install.sh | bash
```
This will automatically download the latest version, install it to your Applications folder, and launch it!

### Option 2: Manual Download
1. Go to the [Releases page](../../releases/latest).
2. Download the latest `API Meter-x.x.x-arm64.dmg` file.
3. Open the downloaded file and drag the **API Meter** app into your `Applications` folder.

**After launching:** Click the ⚙️ **Settings** icon to connect your accounts!

## 🛠️ Development (For Developers)

To build and run the app locally, ensure you have [Node.js](https://nodejs.org/) installed.

```bash
# 1. Clone the repository
git clone https://github.com/kookie2626/api-meter.git
cd api-meter

# 2. Install dependencies
npm install

# 3. Run the app in development mode
npm start

# 4. Build the final DMG package for release
npm run dist
```

> **Note for building releases**: To publish automatically to GitHub Releases, make sure to set your `GH_TOKEN` environment variable before running `npm run dist`.

## 🔒 How it works
- **OpenAI**: Uses the official OpenAI usage API to fetch detailed model-by-model cost breakdowns.
- **Anthropic & Gemini**: Since these platforms do not currently offer public usage APIs, API Meter securely authenticates your active browser session and scrapes the billing dashboard to provide your total monthly spend. 

---

*Made for developers and AI power users who want to keep their API expenses in check.*
