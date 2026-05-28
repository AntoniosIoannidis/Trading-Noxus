// Caching service worker for active assets
let lastDetectedTicker = "";

// Relay messages from content scripts (tabs) to the sidepanel and execute background fetches
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TICKER_DETECTED") {
    // Cache the last successfully detected ticker
    if (message.ticker) {
      lastDetectedTicker = message.ticker;
    }
    // Forward to sidepanel (which will be listening if open), catching errors silently if closed
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Silently consume the error since it is expected when the side panel is closed
      }
    });
  } else if (message.type === "GET_LAST_TICKER") {
    // Return the cached ticker instantly to newly opened sidepanels
    sendResponse({ ticker: lastDetectedTicker });
  } else if (message.type === "FETCH_DATA") {
    // Execute secure CORS-bypassing fetch inside the service worker context
    fetch(message.url, message.options || {})
      .then(async (res) => {
        const text = await res.text();
        sendResponse({ success: res.ok, data: text, status: res.status });
      })
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep message channel open for async response
  }
  return true;
});
