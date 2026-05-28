// Trading-Noxus Background Service Worker
chrome.runtime.onInstalled.addListener(() => {
  // Configure the extension icon click to automatically toggle the side panel
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// Relay messages from content scripts (tabs) to the sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TICKER_DETECTED") {
    // Forward to sidepanel (which will be listening if open)
    chrome.runtime.sendMessage(message);
  }
  // Keep connection open for async operations
  return true;
});
