// Trading-Noxus Background Service Worker

// Configure side panel to open on icon click
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

// Cache the last detected ticker so the sidepanel can grab it instantly on open
let lastDetectedTicker = "";
let lastDetectedSite = "";

// Yahoo Finance crumb/cookie session cache
let yahooCrumb = "";
let yahooCookieHeader = "";
let yahooSessionExpiry = 0;

// Acquire a fresh Yahoo Finance crumb + cookie session
async function acquireYahooSession() {
  const now = Date.now();
  // Reuse cached session if still fresh (valid for 10 minutes)
  if (yahooCrumb && yahooCookieHeader && now < yahooSessionExpiry) {
    return { crumb: yahooCrumb, cookie: yahooCookieHeader };
  }

  try {
    // Step 1: Hit the Yahoo Finance consent/landing page to establish cookies
    const initRes = await fetch("https://finance.yahoo.com/", {
      method: "GET",
      credentials: "include",
      redirect: "follow"
    });
    // Read response to complete the request
    await initRes.text();

    // Step 2: Retrieve Yahoo session cookies via the cookies API
    const cookies = await chrome.cookies.getAll({ domain: ".yahoo.com" });
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");

    if (!cookieStr) {
      console.warn("[Noxus BG] No Yahoo cookies found after init request.");
      return { crumb: "", cookie: "" };
    }

    // Step 3: Fetch the crumb using the established session
    const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      method: "GET",
      headers: {
        "Cookie": cookieStr,
        "User-Agent": "Mozilla/5.0"
      },
      credentials: "include"
    });

    if (!crumbRes.ok) {
      console.warn("[Noxus BG] Crumb fetch failed with status:", crumbRes.status);
      return { crumb: "", cookie: "" };
    }

    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.startsWith("<") || crumb.startsWith("{")) {
      console.warn("[Noxus BG] Invalid crumb received:", crumb.substring(0, 50));
      return { crumb: "", cookie: "" };
    }

    // Cache the session
    yahooCrumb = crumb;
    yahooCookieHeader = cookieStr;
    yahooSessionExpiry = now + 10 * 60 * 1000; // 10 minute TTL

    console.log("[Noxus BG] Yahoo session acquired. Crumb:", crumb);
    return { crumb, cookie: cookieStr };

  } catch (err) {
    console.error("[Noxus BG] Failed to acquire Yahoo session:", err);
    return { crumb: "", cookie: "" };
  }
}

// Inject crumb and cookies into Yahoo Finance API requests
function isYahooApiUrl(url) {
  return url.includes("query1.finance.yahoo.com") || url.includes("query2.finance.yahoo.com");
}

function injectYahooAuth(url, options, crumb, cookie) {
  // Append crumb to URL query params
  const separator = url.includes("?") ? "&" : "?";
  const authedUrl = `${url}${separator}crumb=${encodeURIComponent(crumb)}`;

  // Inject cookie into headers
  const headers = { ...(options.headers || {}) };
  headers["Cookie"] = cookie;
  headers["User-Agent"] = "Mozilla/5.0";

  return { url: authedUrl, options: { ...options, headers } };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TICKER_DETECTED") {
    // Cache it
    if (message.ticker) {
      lastDetectedTicker = message.ticker;
      lastDetectedSite = message.site || "";
      console.log("[Noxus BG] Cached ticker:", lastDetectedTicker);
    }
    // Try to forward to sidepanel (may not be open)
    chrome.runtime.sendMessage(message, () => {
      if (chrome.runtime.lastError) { /* sidepanel closed, ignore */ }
    });

  } else if (message.type === "GET_LAST_TICKER") {
    // Sidepanel asks for the cached ticker on startup
    sendResponse({ ticker: lastDetectedTicker, site: lastDetectedSite });

  } else if (message.type === "FETCH_DATA") {
    // CORS-free fetch relay through the service worker
    const url = message.url;
    const options = message.options || {};

    const doFetch = async () => {
      try {
        let fetchUrl = url;
        let fetchOptions = { ...options };

        // If this is a Yahoo Finance API call, inject crumb + cookies
        if (isYahooApiUrl(url)) {
          const session = await acquireYahooSession();
          if (session.crumb && session.cookie) {
            const authed = injectYahooAuth(url, options, session.crumb, session.cookie);
            fetchUrl = authed.url;
            fetchOptions = authed.options;
          }
        }

        const res = await fetch(fetchUrl, fetchOptions);
        const text = await res.text();

        // If Yahoo returns 401/403, invalidate cache and retry once
        if (isYahooApiUrl(url) && (res.status === 401 || res.status === 403)) {
          console.warn("[Noxus BG] Yahoo auth failed, invalidating session and retrying...");
          yahooCrumb = "";
          yahooCookieHeader = "";
          yahooSessionExpiry = 0;

          const freshSession = await acquireYahooSession();
          if (freshSession.crumb && freshSession.cookie) {
            const retryAuthed = injectYahooAuth(url, options, freshSession.crumb, freshSession.cookie);
            const retryRes = await fetch(retryAuthed.url, retryAuthed.options);
            const retryText = await retryRes.text();
            sendResponse({ success: retryRes.ok, data: retryText, status: retryRes.status });
            return;
          }
        }

        sendResponse({ success: res.ok, data: text, status: res.status });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    };

    doFetch();
    return true; // keep channel open for async

  } else if (message.type === "INVALIDATE_YAHOO_SESSION") {
    // Allow the sidepanel to force a session refresh
    yahooCrumb = "";
    yahooCookieHeader = "";
    yahooSessionExpiry = 0;
    sendResponse({ success: true });
  }

  return true;
});
