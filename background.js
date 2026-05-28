// Trading-Noxus Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  // Configure the extension icon click to automatically toggle the side panel
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// Relay messages from content scripts (tabs) to the sidepanel and execute background fetches
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TICKER_DETECTED") {
    // Forward to sidepanel (which will be listening if open), catching errors silently if closed
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) {
        // Silently consume the error since it is expected when the side panel is closed
      }
    });
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
