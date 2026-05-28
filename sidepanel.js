// Trading-Noxus AI Sidebar Assistant Brain

// State management
let activeTicker = "";
let activeCompany = "";
let currentPrice = 0;
let previousPrice = 0;
let currentChange = "";
let currentChangePercent = 0;
let geminiApiKey = "";
let activeTabId = "signals";

// Computed Technical / Fundamental Indicators to feed Gemini
let marketIndicators = {
  tech: { rsi: "50", sma: "Neutral", trend: "Neutral", comment: "No chart loaded." },
  fund: { pe: "N/A", margin: "N/A", moat: "Neutral", comment: "No financials loaded." },
  sent: { rating: "Neutral", buzz: "Low", comment: "No news headlines parsed." }
};

// Paper Portfolio Default State
let portfolio = {
  balance: 100000.00,
  positions: [],
  history: []
};

// Initialize Extension Sidepanel
async function backgroundFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: "FETCH_DATA",
      url: url,
      options: options
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response && response.success) {
        resolve({
          ok: true,
          status: response.status || 200,
          json: async () => JSON.parse(response.data),
          text: async () => response.data
        });
      } else {
        reject(new Error(response ? response.error : "Unknown background fetch error"));
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  setupUIEventListeners();
  
  // Try to find the active ticker immediately on load, checking tab domain first to prevent connection errors
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].url) {
      const url = tabs[0].url;
      const isSupported = ["finance.yahoo.com", "tradingview.com", "coinmarketcap.com", "trading212.com"].some(domain => url.includes(domain));
      if (isSupported) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "GET_CURRENT_TICKER" }, (response) => {
          if (chrome.runtime.lastError) {
            // Content script is not injected yet (e.g. extension was just reloaded). Prompt user to refresh.
            document.getElementById("active-name").innerHTML = `
              Noxus AI linked. <span style="color: var(--color-cyan); font-weight: 700;">Please refresh this tab</span> to initialize the live feed!
            `;
            return;
          }
          if (response && response.ticker) {
            handleNewTicker(response.ticker);
          }
        });
      }
    }
  });
});

// Load Settings from Local Chrome Storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["geminiApiKey", "portfolio"], (data) => {
      // Load API Key
      if (data.geminiApiKey) {
        geminiApiKey = data.geminiApiKey;
        document.getElementById("api-key-input").value = geminiApiKey;
        document.getElementById("settings-key-input").value = geminiApiKey;
        showScreen("main-screen");
      } else {
        showScreen("setup-screen");
      }
      
      // Load Portfolio State
      if (data.portfolio) {
        portfolio = data.portfolio;
        // Verify structure
        if (!portfolio.positions) portfolio.positions = [];
        if (!portfolio.history) portfolio.history = [];
        if (portfolio.balance === undefined) portfolio.balance = 100000.00;
      }
      
      updatePortfolioUI();
      resolve();
    });
  });
}

// Show/Hide Screens
function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(screenId).classList.remove("hidden");
}

// Setup Event Listeners
function setupUIEventListeners() {
  // Navigation Tabs Switcher
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      
      tab.classList.add("active");
      activeTabId = tab.dataset.tab;
      document.getElementById(`panel-${activeTabId}`).classList.add("active");
    });
  });

  // Settings Panel Toggles
  document.getElementById("settings-toggle-btn").addEventListener("click", () => {
    document.getElementById("settings-overlay").classList.remove("hidden");
  });
  document.getElementById("settings-close-btn").addEventListener("click", () => {
    document.getElementById("settings-overlay").classList.add("hidden");
  });

  // Save Keys buttons
  document.getElementById("save-key-btn").addEventListener("click", () => saveKey("api-key-input"));
  document.getElementById("settings-save-btn").addEventListener("click", () => saveKey("settings-key-input"));

  // Simulated Trades buttons
  document.getElementById("sim-buy-btn").addEventListener("click", () => placeSimulatedOrder("BUY"));
  document.getElementById("sim-sell-btn").addEventListener("click", () => placeSimulatedOrder("SELL"));

  // Manual Trigger Analysis button
  document.getElementById("trigger-analysis-btn").addEventListener("click", () => runAIAnalysisCommittee());

  // Reset Portfolio log button
  document.getElementById("reset-portfolio-btn").addEventListener("click", resetPortfolioHistory);

  // Click active ticker to open TradingView
  document.getElementById("active-ticker").addEventListener("click", () => {
    if (activeTicker && activeTicker !== "SELECT ASSET") {
      chrome.tabs.create({ url: `https://www.tradingview.com/chart/?symbol=${activeTicker}` });
    }
  });
}

// Save Gemini API Key
function saveKey(inputId) {
  const key = document.getElementById(inputId).value.trim();
  if (key) {
    geminiApiKey = key;
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      showScreen("main-screen");
      document.getElementById("settings-overlay").classList.add("hidden");
      // Populate fields across both screens
      document.getElementById("api-key-input").value = key;
      document.getElementById("settings-key-input").value = key;
      
      if (activeTicker) {
        runAIAnalysisCommittee();
      }
    });
  } else {
    alert("Please enter a valid Google Gemini API Key.");
  }
}

// Background Listener to detect stock switches
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TICKER_DETECTED") {
    handleNewTicker(message.ticker);
  }
});

// Clean Company Names before passing to search
function cleanCompanyName(name) {
  if (!name) return "";
  return name
    .replace(/\b(Inc|Corp|Ltd|plc|Co|Group|S\.A\.|Holdings|Corporation|Incorporated|Limited|Capital|Partners)\b/ig, "")
    .replace(/[\,\.\-\(\)\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Resolve Ticker using Yahoo Search API
async function resolveTickerSymbol(query) {
  if (!query) return { symbol: "", name: "" };
  
  // If it already looks like a neat short ticker, check if it works or bypasses search
  const cleanQuery = cleanCompanyName(query);
  if (!cleanQuery) return { symbol: query, name: query + " Spot Asset" };
  
  try {
    const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(cleanQuery)}`;
    const res = await backgroundFetch(searchUrl);
    const data = await res.json();
    if (data.quotes && data.quotes.length > 0) {
      const bestQuote = data.quotes[0];
      return {
        symbol: bestQuote.symbol,
        name: bestQuote.longname || bestQuote.shortname || bestQuote.symbol
      };
    }
  } catch (e) {
    console.error("[Noxus] Error resolving symbol via Yahoo Search:", e);
  }
  return { symbol: query.toUpperCase(), name: query + " Spot Asset" };
}

// Update Platform Shortcut Action Buttons
function updateShortcutLinks(ticker) {
  const shortcutBar = document.getElementById("shortcut-bar");
  if (!ticker || ticker === "SELECT ASSET") {
    shortcutBar.classList.add("hidden");
    return;
  }
  
  shortcutBar.classList.remove("hidden");
  
  // Set up click handlers
  const tvBtn = document.getElementById("btn-tradingview");
  const t212Btn = document.getElementById("btn-trading212");
  const yahooBtn = document.getElementById("btn-yahoo");
  
  tvBtn.onclick = () => {
    chrome.tabs.create({ url: `https://www.tradingview.com/chart/?symbol=${ticker}` });
  };
  
  t212Btn.onclick = () => {
    // Open Trading 212 app search or landing page
    chrome.tabs.create({ url: `https://live.trading212.com/` });
  };
  
  yahooBtn.onclick = () => {
    chrome.tabs.create({ url: `https://finance.yahoo.com/quote/${ticker}` });
  };
}

// Handle Stock Switch
async function handleNewTicker(ticker) {
  if (!ticker) return;
  
  // Set Loading Skeletons
  document.getElementById("active-ticker").innerText = ticker.toUpperCase();
  document.getElementById("active-name").innerText = "Resolving asset symbol details...";
  document.getElementById("active-price").innerText = "—";
  document.getElementById("active-change").innerText = "—";
  document.getElementById("active-change").className = "change-text";
  
  // Resolve company name or generic query to precise Yahoo Finance Symbol
  const resolved = await resolveTickerSymbol(ticker);
  const resolvedTicker = resolved.symbol.toUpperCase();
  const resolvedName = resolved.name;
  
  // Avoid re-fetching if activeTicker is already resolved and loaded
  if (resolvedTicker === activeTicker && document.getElementById("active-price").innerText !== "—") {
    return;
  }
  
  activeTicker = resolvedTicker;
  activeCompany = resolvedName;
  
  document.getElementById("active-ticker").innerText = resolvedTicker;
  document.getElementById("active-name").innerText = resolvedName;
  
  // Enable Simulator buttons
  document.getElementById("sim-buy-btn").disabled = false;
  document.getElementById("sim-sell-btn").disabled = false;
  
  // Update Live Pulse to green/flashing indicating search is live
  const pulse = document.getElementById("market-status");
  pulse.className = "live-pulse live-active";
  pulse.title = `Linked dynamically to ${resolvedTicker}`;

  // Reset consensus displays
  document.getElementById("consensus-rating").className = "rating-badge rating-wait";
  document.getElementById("consensus-rating").innerText = "CALCULATING";
  document.getElementById("consensus-text").innerText = `Noxus AI is gathering market technical data, fundamental balance sheets, and social news volumes for ${resolvedTicker}. Awaiting board consensus...`;
  document.getElementById("trigger-analysis-box").classList.add("hidden");
  
  // Update the platform shortcuts immediately
  updateShortcutLinks(resolvedTicker);
  
  // Fetch market data
  await fetchMarketData(resolvedTicker);
}

// Fetch Market Data from Public Yahoo API (Free, CORS-bypassing inside Extension)
async function fetchMarketData(ticker) {
  try {
    // 1. Fetch Intraday Candlestick Chart Data (last 30 days)
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`;
    const chartRes = await backgroundFetch(chartUrl);
    const chartData = await chartRes.json();
    
    if (chartData.chart && chartData.chart.result && chartData.chart.result[0]) {
      const result = chartData.chart.result[0];
      const meta = result.meta;
      activeCompany = meta.symbol;
      previousPrice = currentPrice || meta.regularMarketPrice;
      currentPrice = meta.regularMarketPrice;
      
      const change = currentPrice - meta.chartPreviousClose;
      currentChangePercent = (change / meta.chartPreviousClose) * 100;
      currentChange = `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${change >= 0 ? "+" : ""}${currentChangePercent.toFixed(2)}%)`;
      
      // Update UI Ticker Price Ribbon
      document.getElementById("active-name").innerText = ticker + " Index Spot Asset";
      const priceText = document.getElementById("active-price");
      priceText.innerText = `$${currentPrice.toFixed(2)}`;
      
      // Dynamic color flashing for high frequency visual feedback
      if (currentPrice > previousPrice) {
        priceText.className = "price-text flash-up";
      } else if (currentPrice < previousPrice) {
        priceText.className = "price-text flash-down";
      } else {
        priceText.className = "price-text";
      }
      
      const changeText = document.getElementById("active-change");
      changeText.innerText = currentChange;
      changeText.className = `change-text ${change >= 0 ? "value-profit" : "value-loss"}`;
      
      // Compute Technical indicators locally inside browser!
      computeTechnicalIndicators(result.indicators.quote[0].close);
      
      // Relive current active simulated positions P&L updates
      updateUnrealizedPnl();
    }
    
    // 2. Fetch Fundamentals metrics
    const statsUrl = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${ticker}?modules=defaultKeyStatistics,financialData,summaryDetail`;
    try {
      const statsRes = await backgroundFetch(statsUrl);
      const statsData = await statsRes.json();
      if (statsData.quoteSummary && statsData.quoteSummary.result && statsData.quoteSummary.result[0]) {
        parseFundamentalStats(statsData.quoteSummary.result[0]);
      }
    } catch (e) {
      console.log("No key statistics found for cryptocurrency/index:", e);
    }
    
    // 3. Fetch sentiment news titles
    const searchUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${ticker}`;
    try {
      const searchRes = await backgroundFetch(searchUrl);
      const searchData = await searchRes.json();
      if (searchData.news) {
        parseSentimentNews(searchData.news);
      }
    } catch (e) {
      console.log("No sentiment news array available:", e);
    }

    // Now that details are loaded, show manual trigger in case they want a board meeting immediately
    document.getElementById("trigger-analysis-box").classList.remove("hidden");
    
    // Trigger automatic run of Gemini committee analysis!
    runAIAnalysisCommittee();
    
  } catch (err) {
    console.error("Error fetching market statistics:", err);
    document.getElementById("active-name").innerText = "Failed to load ticker. Unsupported asset structure.";
  }
}

// Compute standard RSI and SMA indicators in JavaScript
function computeTechnicalIndicators(closePrices) {
  // Filter out any null closing prices
  const prices = closePrices.filter(p => p != null);
  if (prices.length < 15) {
    marketIndicators.tech = { rsi: "50", sma: "Neutral", trend: "Sideways", comment: "Insufficient chart history." };
    return;
  }
  
  const latestPrice = prices[prices.length - 1];
  
  // 1. Simple Moving Average (20 days)
  const sma20Slice = prices.slice(-20);
  const sma20 = sma20Slice.reduce((a, b) => a + b, 0) / sma20Slice.length;
  const smaStatus = latestPrice > sma20 ? "Bullish (Above SMA)" : "Bearish (Below SMA)";
  
  // 2. Trend assessment
  const priceChangeMo = ((latestPrice - prices[0]) / prices[0]) * 100;
  const trend = priceChangeMo > 3 ? "Uptrend" : (priceChangeMo < -3 ? "Downtrend" : "Range-bound");
  
  // 3. Relative Strength Index (RSI 14 days)
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - 14; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const rs = gains / (losses || 1);
  const rsiVal = Math.round(100 - (100 / (1 + rs)));
  
  marketIndicators.tech = {
    rsi: rsiVal.toString(),
    sma: latestPrice > sma20 ? "Bullish" : "Bearish",
    trend: trend,
    comment: `Asset price is trading at $${latestPrice.toFixed(2)} in a strong ${trend.toLowerCase()} pattern. Relative strength is hovering at ${rsiVal}.`
  };
  
  // Populate UI Pills
  document.getElementById("ind-rsi").innerText = rsiVal;
  document.getElementById("ind-sma").innerText = latestPrice > sma20 ? "BULL" : "BEAR";
  document.getElementById("ind-trend").innerText = trend.toUpperCase();
}

// Parse standard fundamental balance stats
function parseFundamentalStats(data) {
  const detail = data.summaryDetail || {};
  const fin = data.financialData || {};
  
  const pe = detail.trailingPE ? detail.trailingPE.fmt : "N/A";
  const margin = fin.operatingMargins ? `${(fin.operatingMargins.raw * 100).toFixed(1)}%` : "N/A";
  const divYield = detail.dividendYield ? `${(detail.dividendYield.raw * 100).toFixed(2)}%` : "0.0%";
  
  // Basic Moat logic
  const profitMargin = fin.profitMargins ? fin.profitMargins.raw : 0;
  const moat = profitMargin > 0.15 ? "Strong Moat" : (profitMargin > 0.05 ? "Moderate" : "Narrow Moat");
  
  marketIndicators.fund = {
    pe: pe,
    margin: margin,
    moat: moat,
    comment: `Fundamental sheet outlines a trailing P/E of ${pe} alongside operating profit margins of ${margin} and dividend yield vectors of ${divYield}.`
  };
  
  // Populate UI Pills
  document.getElementById("ind-pe").innerText = pe;
  document.getElementById("ind-margin").innerText = margin;
  document.getElementById("ind-moat").innerText = profitMargin > 0.15 ? "STRONG" : "NARROW";
}

// Parse financial news titles for sentiment assessment
let scrapedNewsHeadlines = [];
function parseSentimentNews(newsArray) {
  scrapedNewsHeadlines = newsArray.slice(0, 5).map(n => n.title);
  const buzz = newsArray.length > 5 ? "High" : "Average";
  
  marketIndicators.sent = {
    rating: "Neutral",
    buzz: buzz,
    comment: `Scraped ${scrapedNewsHeadlines.length} high-impact financial news headlines. Market attention is currently ${buzz.toLowerCase()}.`
  };
  
  document.getElementById("ind-news").innerText = scrapedNewsHeadlines.length;
  document.getElementById("ind-buzz").innerText = buzz.toUpperCase();
}

// Call Google Gemini directly to execute the Quantitative Multi-Agent Debate
async function runAIAnalysisCommittee() {
  if (!geminiApiKey) {
    showScreen("setup-screen");
    return;
  }
  
  // Block trigger buttons during generation
  document.getElementById("trigger-analysis-btn").disabled = true;
  document.getElementById("trigger-analysis-btn").innerText = "⚡ Gathering Committee...";
  
  try {
    const prompt = `
    You are the Board Director of a Quantitative Multi-Agent Hedge Fund called Noxus Capital.
    Your task is to coordinate a board meeting debate regarding ticker symbol: ${activeTicker}.
    
    You will ingest the following quantitative market feeds:
    1. Technical Indicators: Current price $${currentPrice.toFixed(2)}, RSI is ${marketIndicators.tech.rsi}, Trend is ${marketIndicators.tech.trend}, relative to 20-day SMA is ${marketIndicators.tech.sma}.
    2. Fundamental Data: Trailing P/E is ${marketIndicators.fund.pe}, Operating Margins are ${marketIndicators.fund.margin}, Moat Strength rating is ${marketIndicators.fund.moat}.
    3. Sentiment News Headlines:
    ${scrapedNewsHeadlines.map((h, i) => `${i+1}. "${h}"`).join("\n")}
    
    You must orchestrate a simulated debate between 3 board member agents:
    - **Technical Analyst Agent**: focuses on momentum, chart pattern, and levels.
    - **Fundamental Analyst Agent**: focuses on balance sheet valuation, pricing health, and competitive moats.
    - **Crowd Sentiment Agent**: focuses on news headlines, fear/greed retail buzz, and crowd momentum.
    
    Synthesize their debate and write a structured JSON output representing the consensus trading recommendation.
    
    The JSON response must have exactly these keys and types:
    1. "consensus_rating": (must be either "BUY", "SELL", "HOLD", or "WAIT" based on the debate)
    2. "entry_range": (string indicating target entry level, e.g. "$165.50 - $167.00" or near current spot price)
    3. "take_profit": (string indicating target taking profit price, e.g. "$182.00")
    4. "stop_loss": (string indicating defensive stop loss level, e.g. "$160.00")
    5. "confidence": (integer between 0 and 100 representing the committee's agreement level)
    6. "consensus_text": (string, concise 2-sentence summary of the board's final rationale)
    7. "tech_verdict": (string: "BULLISH", "BEARISH", or "NEUTRAL")
    8. "tech_comment": (string, brief 1-sentence comment from Tech Agent)
    9. "fund_verdict": (string: "BULLISH", "BEARISH", or "NEUTRAL")
    10. "fund_comment": (string, brief 1-sentence comment from Fundamental Agent)
    11. "sent_verdict": (string: "BULLISH", "BEARISH", or "NEUTRAL")
    12. "sent_comment": (string, brief 1-sentence comment from Sentiment Agent)
    
    Provide only the raw JSON output in your response without any backticks, markdown wrapping, or conversational intro.
    `;
    
    // REST API Endpoint call for Gemini 1.5 Flash
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
    const response = await backgroundFetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    
    const data = await response.json();
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
      const rawText = data.candidates[0].content.parts[0].text;
      const parsedResults = cleanAndParseJSON(rawText);
      if (parsedResults) {
        renderAIResults(parsedResults);
      }
    } else {
      throw new Error(data.error ? data.error.message : "Malformed API payload.");
    }
  } catch (err) {
    console.error("Gemini call failed:", err);
    document.getElementById("consensus-text").innerText = `Failed to generate AI Committee consensus: ${err.message}. Please verify API Key validity or connection status.`;
  } finally {
    document.getElementById("trigger-analysis-btn").disabled = false;
    document.getElementById("trigger-analysis-btn").innerText = "⚡ Run AI Committee Audit";
  }
}

// Clean and safely parse Gemini output JSON
function cleanAndParseJSON(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  try {
    return JSON.parse(cleaned.trim());
  } catch (e) {
    console.log("JSON parsing error:", e);
    // Simple regex extraction fallback if needed
    return null;
  }
}

// Render Gemini Committee Output to Sidebar UI
function renderAIResults(res) {
  // 1. consensus rating badge
  const badge = document.getElementById("consensus-rating");
  badge.innerText = res.consensus_rating.toUpperCase();
  
  if (res.consensus_rating === "BUY") {
    badge.className = "rating-badge rating-buy";
  } else if (res.consensus_rating === "SELL") {
    badge.className = "rating-badge rating-sell";
  } else if (res.consensus_rating === "HOLD") {
    badge.className = "rating-badge rating-hold";
  } else {
    badge.className = "rating-badge rating-wait";
  }
  
  // 2. entry / stop / limit values
  document.getElementById("signal-entry").innerText = res.entry_range;
  document.getElementById("signal-tp").innerText = res.take_profit;
  document.getElementById("signal-sl").innerText = res.stop_loss;
  
  // 3. Confidence Bar
  document.getElementById("confidence-percentage").innerText = `${res.confidence}%`;
  document.getElementById("confidence-bar").style.width = `${res.confidence}%`;
  
  // 4. Consensus description Text
  document.getElementById("consensus-text").innerText = res.consensus_text;
  
  // 5. Populate individual Agent cards
  // Tech Agent
  document.getElementById("agent-tech-status").innerText = res.tech_verdict.toUpperCase();
  document.getElementById("agent-tech-status").className = `agent-verdict verdict-${res.tech_verdict.toLowerCase()}`;
  document.getElementById("agent-tech-verdict").innerText = res.tech_comment;
  
  // Fundamental Agent
  document.getElementById("agent-fund-status").innerText = res.fund_verdict.toUpperCase();
  document.getElementById("agent-fund-status").className = `agent-verdict verdict-${res.fund_verdict.toLowerCase()}`;
  document.getElementById("agent-fund-verdict").innerText = res.fund_comment;
  
  // Sentiment Agent
  document.getElementById("agent-sent-status").innerText = res.sent_verdict.toUpperCase();
  document.getElementById("agent-sent-status").className = `agent-verdict verdict-${res.sent_verdict.toLowerCase()}`;
  document.getElementById("agent-sent-verdict").innerText = res.sent_comment;
}

// ----------------------------------------------------
// PAPER PORTFOLIO SIMULATION ENGINE
// ----------------------------------------------------

// Place a simulated market order
function placeSimulatedOrder(type) {
  if (!activeTicker || currentPrice <= 0) return;
  
  // Standard simulated size: 100 shares for stocks, 1 unit for crypto
  const isCrypto = activeTicker.length >= 4 && !activeTicker.includes(".");
  const size = isCrypto ? 1 : 100;
  const cost = currentPrice * size;
  
  // Check if enough balance to buy
  if (type === "BUY" && cost > portfolio.balance) {
    alert("Insufficient funds in mock balance sheet to execute transaction.");
    return;
  }
  
  // Check if we already have an open position in this ticker
  const existingIndex = portfolio.positions.findIndex(p => p.ticker === activeTicker && p.type === type);
  
  if (existingIndex > -1) {
    // Average up entry price and increase size
    const pos = portfolio.positions[existingIndex];
    const totalCost = (pos.entryPrice * pos.size) + cost;
    pos.size += size;
    pos.entryPrice = totalCost / pos.size;
  } else {
    // Open a fresh position
    portfolio.positions.push({
      ticker: activeTicker,
      type: type,
      size: size,
      entryPrice: currentPrice,
      currentPrice: currentPrice,
      unrealizedPnl: 0.0
    });
  }
  
  // Deduct from mock balance sheet
  if (type === "BUY") {
    portfolio.balance -= cost;
  } else {
    // Shorting increases balance momentarily
    portfolio.balance += cost;
  }
  
  savePortfolio();
  updatePortfolioUI();
}

// Close an active position
function closeSimulatedPosition(ticker, type) {
  const idx = portfolio.positions.findIndex(p => p.ticker === ticker && p.type === type);
  if (idx === -1) return;
  
  const pos = portfolio.positions[idx];
  const proceeds = currentPrice * pos.size;
  
  // Compute final profit & loss
  let finalPnl = 0.0;
  if (pos.type === "BUY") {
    finalPnl = proceeds - (pos.entryPrice * pos.size);
    portfolio.balance += proceeds; // Receive cash back
  } else {
    // Short: buyback position to close
    finalPnl = (pos.entryPrice * pos.size) - proceeds;
    portfolio.balance -= proceeds; // Repay cash to close short
  }
  
  // Record in historical closed logs
  portfolio.history.unshift({
    ticker: pos.ticker,
    type: pos.type,
    size: pos.size,
    entryPrice: pos.entryPrice,
    closePrice: currentPrice,
    pnl: finalPnl,
    timestamp: new Date().toLocaleTimeString()
  });
  
  // Remove position
  portfolio.positions.splice(idx, 1);
  
  savePortfolio();
  updatePortfolioUI();
}

// Compute P&L dynamically based on ticker updates
function updateUnrealizedPnl() {
  let updated = false;
  portfolio.positions.forEach(pos => {
    if (pos.ticker === activeTicker) {
      pos.currentPrice = currentPrice;
      if (pos.type === "BUY") {
        pos.unrealizedPnl = (currentPrice - pos.entryPrice) * pos.size;
      } else {
        pos.unrealizedPnl = (pos.entryPrice - currentPrice) * pos.size;
      }
      updated = true;
    }
  });
  
  if (updated) {
    savePortfolio();
    updatePortfolioUI();
  }
}

// Save portfolio state to Chrome storage
function savePortfolio() {
  chrome.storage.local.set({ portfolio: portfolio });
}

// Update Portfolio Dashboard Cards & Lists
function updatePortfolioUI() {
  // 1. Balance
  document.getElementById("port-balance").innerText = `$${portfolio.balance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  // 2. Unrealized P&L
  let totalUnrealized = 0.0;
  portfolio.positions.forEach(p => totalUnrealized += p.unrealizedPnl);
  
  const pnlText = document.getElementById("port-unrealized-pnl");
  pnlText.innerText = `${totalUnrealized >= 0 ? "+" : ""}$${totalUnrealized.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  
  if (totalUnrealized > 0.01) {
    pnlText.className = "stat-value pnl-profit";
  } else if (totalUnrealized < -0.01) {
    pnlText.className = "stat-value pnl-loss";
  } else {
    pnlText.className = "stat-value pnl-neutral";
  }
  
  // 3. Win Rate
  let winrate = 0;
  if (portfolio.history.length > 0) {
    const wins = portfolio.history.filter(h => h.pnl > 0).length;
    winrate = Math.round((wins / portfolio.history.length) * 100);
  }
  document.getElementById("port-winrate").innerText = `${winrate}%`;
  
  // 4. Render Positions list
  const positionsDiv = document.getElementById("positions-list");
  positionsDiv.innerHTML = "";
  
  if (portfolio.positions.length === 0) {
    positionsDiv.innerHTML = `<div class="no-positions">No open positions. Use the market buttons above to simulate trades.</div>`;
  } else {
    portfolio.positions.forEach(pos => {
      const card = document.createElement("div");
      card.className = "position-card";
      
      const pnlClass = pos.unrealizedPnl >= 0 ? "pos-pnl value-profit" : "pos-pnl value-loss";
      
      card.innerHTML = `
        <div class="position-details">
          <span class="pos-ticker">${pos.ticker}</span>
          <span class="pos-type type-${pos.type.toLowerCase()}">${pos.type}</span>
          <span class="pos-size">${pos.size} shares @ $${pos.entryPrice.toFixed(2)}</span>
        </div>
        <div class="pos-price-group">
          <span class="${pnlClass}">${pos.unrealizedPnl >= 0 ? "+" : ""}$${pos.unrealizedPnl.toFixed(2)}</span>
          <button class="pos-close-btn" data-ticker="${pos.ticker}" data-type="${pos.type}">CLOSE</button>
        </div>
      `;
      positionsDiv.appendChild(card);
    });
    
    // Add close position events
    positionsDiv.querySelectorAll(".pos-close-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        closeSimulatedPosition(btn.dataset.ticker, btn.dataset.type);
      });
    });
  }
  
  // 5. Render History list
  const historyDiv = document.getElementById("history-list");
  historyDiv.innerHTML = "";
  
  if (portfolio.history.length === 0) {
    historyDiv.innerHTML = `<div class="no-history">No trading history logs recorded yet.</div>`;
  } else {
    portfolio.history.forEach(hist => {
      const card = document.createElement("div");
      card.className = "history-card";
      
      const pnlClass = hist.pnl >= 0 ? "hist-pnl value-profit" : "hist-pnl value-loss";
      
      card.innerHTML = `
        <div class="history-details">
          <span class="hist-ticker">${hist.ticker}</span>
          <span class="pos-type type-${hist.type.toLowerCase()}">CLOSED ${hist.type}</span>
          <span class="pos-size">${hist.size} @ avg $${hist.entryPrice.toFixed(2)} → closed @ $${hist.closePrice.toFixed(2)}</span>
        </div>
        <div class="hist-pnl-group">
          <span class="${pnlClass}">${hist.pnl >= 0 ? "+" : ""}$${hist.pnl.toFixed(2)}</span>
          <span class="pos-size" style="font-size:0.6rem;">${hist.timestamp}</span>
        </div>
      `;
      historyDiv.appendChild(card);
    });
  }
}

// Reset Portfolio history log
function resetPortfolioHistory() {
  if (confirm("Are you sure you want to wipe all transaction logs and reset mock capital to $100,000.00?")) {
    portfolio = {
      balance: 100000.00,
      positions: [],
      history: []
    };
    savePortfolio();
    updatePortfolioUI();
  }
}
