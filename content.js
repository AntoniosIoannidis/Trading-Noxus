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
      // In Chart View, check document title (e.g., "AAPL Chart - TradingView")
      const titleMatch = document.title.match(/^([A-Za-z0-9\.\-]+)\s+/);
      if (titleMatch && titleMatch[1]) {
        ticker = titleMatch[1].toUpperCase();
      }
    }
  } else if (url.includes("trading212.com")) {
    // Parse Trading 212 active instrument details (DOM headers or browser title)
    const activeHeader = document.querySelector(".instrument-name, .instrument-title, .chart-title, [data-qa='instrument-name']");
    if (activeHeader && activeHeader.innerText) {
      ticker = activeHeader.innerText.split("-")[0].trim().toUpperCase();
    } else {
      const titleMatch = document.title.match(/^([A-Za-z0-9\.\-\=\_]+)\s+[\-\—]/);
      if (titleMatch && titleMatch[1]) {
        ticker = titleMatch[1].toUpperCase();
      }
    }
  }

  // If a new valid ticker is found, dispatch it
  if (ticker && ticker !== currentTicker && ticker.length < 10) {
    currentTicker = ticker;
    console.log("[Trading-Noxus] Active ticker detected:", ticker);
    try {
      chrome.runtime.sendMessage({
        type: "TICKER_DETECTED",
        ticker: ticker,
        site: window.location.hostname
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
