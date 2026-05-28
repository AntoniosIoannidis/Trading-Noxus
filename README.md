# 📈 Trading-Noxus AI — Quantitative Multi-Agent Browser Assistant

**Trading-Noxus AI** is an institutional-grade, serverless Manifest V3 Chrome Extension. It functions as an autonomous quantitative trading advisor and simulator that slides seamlessly into your browser. 

Whenever you navigate to stock or crypto charts (on **TradingView**, **Yahoo Finance**, or **CoinMarketCap**), Noxus AI automatically binds to the page, gathers real-time market data, orchestrates a simulated board-meeting debate between three specialized AI Agents, and serves high-confidence execution signals (Buy/Sell/Hold, Stop Loss, and Take Profit) directly alongside your chart.

It also features a stateful **Paper Portfolio Engine** that lets you place simulated market orders based on live prices, managing active positions and closed logs with auto-updating unrealized Profit & Loss trackers.

---

## 🚀 Key Architectural Highlights

*   **100% Serverless & Keyless Market Data**: Bypasses the need for expensive financial data subscriptions. It queries Yahoo Finance's internal APIs directly to pull real-time intraday candlestick chart data, fundamental statistics, and financial news arrays.
*   **Zero-friction Installation**: Bypasses database server setups, API gateways, or server proxies. It is fully self-contained in a Chrome extension package.
*   **CORS Bypass**: Leverages Chrome Extension host permissions to fetch directly from financial endpoints and the Gemini REST gateway without triggering browser CORS blocks.
*   **Multi-Agent Quantitative Committee**:
    *   **Agent 1 (The Chart Technical Analyst)**: Assesses moving averages (SMA 20) and Relative Strength Indexes (RSI) computed dynamically inside the javascript runtime.
    *   **Agent 2 (The Financial Fundamentalist)**: Audits company P/E ratios, operating margins, competitive moats, and dividend metrics.
    *   **Agent 3 (The Social Sentiment Agent)**: Evaluates high-frequency market search buzz and scrapes financial news articles to extract crowd sentiment.
    *   **The Board Director (Gemini 1.5 Flash)**: Synthesizes the agents' reports, debates market opportunities, and generates a structured consensus signal.

---

## 🎨 Premium Visual UI/UX Design

*   **Carbon Dark Glassmorphic Theme**: Designed with a high-end radial background gradient, semi-transparent frosted cards (`backdrop-filter: blur(16px)`), and glowing neon purple and cyan accents.
*   **Tick-by-Tick Flashing Price ribbon**: Highlights live market price changes in real time with high-performance CSS flashing indicators (green flash for price increases, red flash for decreases).
*   **Automated Navigation Tabs**: Smooth tab-switching transitions between execution signals, individual agent consensus comment logs, and the portfolio dashboard.
*   **Active Heartbeat Pulse Indicator**: Pulsing neon green dot in the header indicating a live active page connection to a financial tab.

---

## 🛠 Installation Instructions

Install the extension in under 60 seconds:

1.  **Clone / Download the Repository**:
    Ensure all files (`manifest.json`, `background.js`, `content.js`, `sidepanel.html`, `sidepanel.css`, `sidepanel.js`, and `icons/` folder) are located in your local folder:
    `C:\Users\Lenovo\Documents\GitHub\Trading-Noxus`

2.  **Open Chrome Extensions**:
    Open Google Chrome and navigate to: `chrome://extensions/`

3.  **Enable Developer Mode**:
    Toggle the **"Developer mode"** switch in the top-right corner of the Extensions page.

4.  **Load Unpacked Extension**:
    Click the **"Load unpacked"** button in the top-left corner. Select the `Trading-Noxus` folder from your local directory.

5.  **Pin & Initialize**:
    *   Pin the **Trading-Noxus AI** extension icon to your Chrome toolbar.
    *   Click the extension icon to slide open the side panel.
    *   Paste your free Gemini API Key (get one from [Google AI Studio](https://aistudio.google.com/)) to initialize the board committee.

6.  **Test the Live Link**:
    Navigate to any Quote page on [Yahoo Finance](https://finance.yahoo.com/quote/AAPL) or [TradingView](https://www.tradingview.com/symbols/NASDAQ-AAPL/). The sidepanel will instantly flash, detect the symbol, pull market data, and generate your quantitative trade recommendation!

---

*This project represents a professional-grade FinTech portfolio implementation, showcasing advanced client-side architecture, live data engineering, and multi-agent AI orchestration.*
