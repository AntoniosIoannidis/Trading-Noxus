// Trading-Noxus Content Script
let currentTicker = "";

function parseTicker() {
  let ticker = "";
  const url = window.location.href;

  if (url.includes("finance.yahoo.com")) {
    // Parse Yahoo Finance quotes standard format (e.g., https://finance.yahoo.com/quote/AAPL/)
    const match = url.match(/\/quote\/([A-Za-z0-9\.\=\-]+)/);
    if (match && match[1]) {
      // Exclude generic suffixes or page actions
      const parsed = match[1].split("?")[0];
      if (parsed && parsed.toUpperCase() !== "QUOTE") {
        ticker = parsed.toUpperCase();
      }
    }
  } else if (url.includes("tradingview.com")) {
    // Parse TradingView symbols format (e.g., https://www.tradingview.com/symbols/NASDAQ-AAPL/)
    const match = url.match(/\/symbols\/([A-Za-z0-9]+)\-([A-Za-z0-9\.\-]+)/);
    if (match && match[2]) {
      ticker = match[2].toUpperCase();
    } else if (url.includes("/chart/")) {
      // Try to find the active symbol from the DOM first
      const tvSelectors = [
        "[data-name='legend-series-item-title']",
        ".symbol-title",
        ".chart-controls-symbol-selector",
        "#header-toolbar-symbol-search"
      ];
      const tvEl = document.querySelector(tvSelectors.join(", "));
      if (tvEl && tvEl.innerText) {
        ticker = tvEl.innerText.trim().toUpperCase();
      } else {
        // Fallback to check document title (e.g., "AAPL Chart - TradingView")
        const titleMatch = document.title.match(/^([A-Za-z0-9\.\-]+)\s+/);
        if (titleMatch && titleMatch[1]) {
          ticker = titleMatch[1].toUpperCase();
        }
      }
    }
  } else if (url.includes("trading212.com")) {
    // Parse Trading 212 active instrument details using extensive class wildcards to combat minification
    const selectors = [
      ".instrument-name",
      ".instrument-title",
      ".chart-title",
      ".chart-header__title",
      ".chart-header__symbol",
      ".instrument-info__name",
      ".equity-title",
      "[class*='instrument-name']",
      "[class*='instrument-title']",
      "[class*='chart-title']",
      "[class*='chart-header']",
      "[class*='equity-title']",
      "[class*='instrument-info']",
      "[class*='equityHeader']",
      "[data-qa='instrument-name']",
      "[data-qa='chart-title']",
      "[data-qa='instrument-title']"
    ];
    const activeHeader = document.querySelector(selectors.join(", "));
    if (activeHeader && activeHeader.innerText) {
      ticker = activeHeader.innerText.split("-")[0].trim();
    } else {
      // Match anything before the hyphen or dash in browser title
      const titleMatch = document.title.match(/^([^\-\—]+)\s+[\-\—]/);
      if (titleMatch && titleMatch[1]) {
        ticker = titleMatch[1].trim();
      }
    }

    // Exclude generic platform names/titles
    if (ticker) {
      const lowerTicker = ticker.toLowerCase();
      if (
        lowerTicker.includes("trading 212") || 
        lowerTicker === "demo" || 
        lowerTicker === "live" || 
        lowerTicker === "cfd" || 
        lowerTicker === "invest" ||
        lowerTicker === "isa"
      ) {
        ticker = "";
      }
    }
  }

  // If a new valid ticker is found, dispatch it
  if (ticker && ticker !== currentTicker && ticker.length < 35) {
    currentTicker = ticker;
    console.log("[Trading-Noxus] Active ticker detected:", ticker);
    try {
      chrome.runtime.sendMessage({
        type: "TICKER_DETECTED",
        ticker: ticker,
        site: window.location.hostname
      }, () => {
        if (chrome.runtime.lastError) {
          // Consume silently
        }
      });
    } catch (e) {
      // Handle extension context invalidated silently
    }
  }
}

// Initial execution
parseTicker();

// Periodically check for ticker updates to support modern single-page apps (SPA)
setInterval(parseTicker, 2000);

// Setup MutationObserver to detect title changes instantly (for high-speed responsiveness in SPAs)
try {
  const targetNode = document.querySelector("title");
  if (targetNode) {
    const observer = new MutationObserver(() => {
      parseTicker();
    });
    observer.observe(targetNode, { childList: true, characterData: true, subtree: true });
  }
} catch (e) {
  console.log("[Trading-Noxus] Title observer setup failed:", e);
}

// Listen for direct queries from the sidepanel on startup/reload
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_CURRENT_TICKER") {
    parseTicker();
    sendResponse({ ticker: currentTicker });
  }
  return true;
});
