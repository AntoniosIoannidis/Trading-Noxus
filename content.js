// Trading-Noxus Content Script
// Runs on: Yahoo Finance, TradingView, CoinMarketCap, Trading 212, and inside iframes (all_frames: true)

let currentTicker = "";

function parseTicker() {
  const url = window.location.href;
  const hostname = window.location.hostname;
  const title = document.title || "";
  let ticker = "";

  // Helper validation function to filter out layout terms, platform navigation, and empty strings
  function isValidTicker(val) {
    if (!val) return false;
    const clean = val.replace(/[\(\)]/g, "").trim();
    if (clean.length === 0 || clean.length > 35) return false;
    
    const lower = clean.toLowerCase();
    if (
      lower.includes("trading 212") ||
      lower.includes("tradingview") ||
      lower.includes("yahoo") ||
      lower.includes("coinmarketcap") ||
      lower === "demo" ||
      lower === "live" ||
      lower === "cfd" ||
      lower === "invest" ||
      lower === "isa" ||
      lower === "trading" ||
      lower === "chart" ||
      lower === "stock" ||
      lower === "stocks" ||
      lower === "etf" ||
      lower === "etfs" ||
      lower === "portfolio" ||
      lower === "watchlist" ||
      lower === "search" ||
      lower === "position" ||
      lower === "positions" ||
      lower === "history" ||
      lower === "orders" ||
      lower === "order" ||
      lower === "home" ||
      lower === "more" ||
      lower === "menu" ||
      lower === "settings" ||
      lower === "help" ||
      lower === "account" ||
      lower === "practice" ||
      lower === "real" ||
      lower === "profile" ||
      lower === "funds" ||
      lower === "reports"
    ) {
      return false;
    }
    return true;
  }

  // ============================================================
  // STRATEGY 1: URL query params (works in iframes & chart widgets)
  // ============================================================
  try {
    const params = new URLSearchParams(window.location.search);
    const sym = params.get("symbol") || params.get("ticker") || params.get("pair") || params.get("value");
    if (sym) {
      const candidate = sym.split(":").pop().trim();
      if (isValidTicker(candidate)) {
        ticker = candidate.toUpperCase();
      }
    }
  } catch (e) {}

  // ============================================================
  // STRATEGY 1B: URL hash parsing (works in some SPAs & charts)
  // ============================================================
  if (!ticker) {
    try {
      const hash = window.location.hash;
      if (hash) {
        const hashParts = hash.split("/");
        for (const part of hashParts) {
          const candidate = part.replace(/[^A-Za-z0-9\.\-]/g, "").trim();
          if (isValidTicker(candidate)) {
            ticker = candidate.toUpperCase();
            break;
          }
        }
      }
    } catch (e) {}
  }

  // ============================================================
  // STRATEGY 2: URL path parsing
  // ============================================================
  if (!ticker) {
    // Yahoo Finance: /quote/AAPL/
    const yahooMatch = url.match(/finance\.yahoo\.com\/quote\/([A-Za-z0-9\.\=\-]+)/);
    if (yahooMatch && yahooMatch[1]) {
      const parsed = yahooMatch[1].split("?")[0];
      if (isValidTicker(parsed)) {
        ticker = parsed.toUpperCase();
      }
    }

    // TradingView: /symbols/NASDAQ-AAPL/
    if (!ticker) {
      const tvMatch = url.match(/tradingview\.com\/symbols\/([A-Za-z0-9]+)\-([A-Za-z0-9\.\-]+)/);
      if (tvMatch && tvMatch[2]) {
        const parsed = tvMatch[2];
        if (isValidTicker(parsed)) {
          ticker = parsed.toUpperCase();
        }
      }
    }

    // Trading 212: e.g. trading212.com/trading-instruments/EQUITY/AAPL or live.trading212.com/beta/chart/AAPL or similar
    if (!ticker) {
      const t212Match = url.match(/trading212\.(?:com|co\.uk|de|fr|nl|bg|com\.tr)\/(?:trading-instruments\/[A-Za-z0-9]+\/|beta\/chart\/|chart\/|instrument\/|equity\/)?([A-Za-z0-9\.\-]+)/i);
      if (t212Match && t212Match[1]) {
        const parsed = t212Match[1].split("?")[0].split("#")[0];
        if (isValidTicker(parsed)) {
          ticker = parsed.toUpperCase();
        }
      }
    }
  }

  // ============================================================
  // STRATEGY 3: DOM element scanning (works on any page)
  // ============================================================
  if (!ticker) {
    const domSelectors = [
      // TradingView chart elements
      "[data-name='legend-series-item'] .apply-common-tooltip",
      "[data-name='legend-source-item'] .apply-common-tooltip",
      ".chart-controls-bar .apply-common-tooltip",
      // Trading 212 data-testid / data-qa selectors (very stable attributes)
      "[data-testid='instrument-screen-header-title']",
      "[data-testid*='instrument-name']",
      "[data-testid*='instrument-title']",
      "[data-testid*='instrument-header']",
      "[data-testid*='header-title']",
      "[data-testid*='instrument']",
      "[data-testid*='ticker']",
      "[data-testid*='symbol']",
      "[data-testid*='asset']",
      "[data-qa*='instrument']",
      "[data-qa*='ticker']",
      "[data-qa*='symbol']",
      "[data-qa*='title']",
      "[data-qa*='name']",
      // Trading 212 elements (wildcard matching for obfuscated classes)
      "[class*='instrument-name']",
      "[class*='instrument-title']",
      "[class*='equity-title']",
      "[class*='equityHeader']",
      "[class*='chart-header']",
      "[class*='chart-title']",
      "[class*='instrument-info']",
      "[data-qa='instrument-name']",
      "[data-qa='chart-title']",
      "[data-qa='instrument-title']",
      // Standard class names
      ".instrument-name",
      ".instrument-title",
      ".chart-title",
      ".equity-title",
      // Generic selectors for asset header in Trading 212 app
      ".chart-container-header .title",
      ".chart-header-title",
      ".equity-header-title",
      ".instrument-header-title",
      "[class*='ChartHeader'] [class*='title']",
      "[class*='InstrumentHeader'] [class*='title']",
      "[class*='equity'] [class*='title']",
      ".equity-title-text"
    ];

    for (const sel of domSelectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.innerText) {
          let text = el.innerText.trim();
          // If there's a newline (common in Trading 212 headers showing ticker + name), grab the first line
          if (text.includes("\n")) {
            text = text.split("\n")[0].trim();
          }
          const candidate = text.split("-")[0].split("·")[0].trim();
          if (isValidTicker(candidate)) {
            ticker = candidate.replace(/[\(\)]/g, "").trim();
            break;
          }
        }
      } catch (e) {}
    }
  }

  // ============================================================
  // STRATEGY 4: Document title parsing (universal fallback)
  // ============================================================
  if (!ticker && title) {
    // TradingView title: "AAPL Chart — TradingView"
    const tvTitle = title.match(/^([A-Z0-9\.\-]{1,10})\s+(Chart|Stock)/i);
    if (tvTitle && tvTitle[1]) {
      const candidate = tvTitle[1];
      if (isValidTicker(candidate)) {
        ticker = candidate.toUpperCase();
      }
    }

    // Generic title with dashes: "NVIDIA - Trading 212 - Invest"
    if (!ticker) {
      const parts = title.split(/[\-\—\–\|]/);
      for (const part of parts) {
        const candidate = part.trim();
        if (isValidTicker(candidate)) {
          ticker = candidate;
          break;
        }
      }
    }
  }

  // ============================================================
  // FINAL: Filter out garbage and dispatch
  // ============================================================
  if (ticker) {
    // Final cleanup
    ticker = ticker.replace(/[\(\)]/g, "").trim();
    if (!isValidTicker(ticker)) {
      ticker = "";
    }
  }

  // Dispatch if we found something new
  if (ticker && ticker !== currentTicker) {
    currentTicker = ticker;
    console.log("[Trading-Noxus] Detected:", ticker, "from:", hostname);
    try {
      chrome.runtime.sendMessage({
        type: "TICKER_DETECTED",
        ticker: ticker,
        site: hostname
      }, () => {
        if (chrome.runtime.lastError) { /* extension context gone, ignore */ }
      });
    } catch (e) { /* context invalidated */ }
  }
}

// Run immediately
parseTicker();

// Re-check every 2 seconds for SPA navigation
setInterval(parseTicker, 2000);

// Watch for title changes (instant SPA detection)
try {
  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(() => parseTicker())
      .observe(titleEl, { childList: true, characterData: true, subtree: true });
  }
} catch (e) {}

// Watch for major DOM changes (catches Trading 212 SPA instrument switches)
try {
  new MutationObserver(() => parseTicker())
    .observe(document.body || document.documentElement, { childList: true, subtree: true });
} catch (e) {}

// Respond to direct queries from sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_CURRENT_TICKER") {
    parseTicker();
    sendResponse({ ticker: currentTicker });
  }
  return true;
});
