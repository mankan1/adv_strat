// SmartOpportunitiesAlpacaUniverse.js
// ✅ DROP-IN replacement
// - Alpaca: universe screeners + snapshots (unchanged)
// - Your backend: quote + options chain (unchanged)
// - Tradier: unusual options + portfolio quotes (unchanged)
// - ✅ Finnhub: ONLY company name + "sector" label (uses finnhubIndustry from /stock/profile2)
//   (Finnhub doesn't reliably return a true GICS sector everywhere; this uses finnhubIndustry as the sector label.)

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  TextInput,
  Platform,
  Linking,
  Share,
} from "react-native";

// ✅ Clipboard (Expo OR RN). Pick one:
let Clipboard = null;
try {
  Clipboard = require("expo-clipboard");
} catch (e) {
  try {
    Clipboard = require("@react-native-clipboard/clipboard").default;
  } catch (e2) {
    Clipboard = null;
  }
}

// OPTIONAL (remove if you don't want persistence)
let AsyncStorage = null;
try {
  // eslint-disable-next-line global-require
  AsyncStorage = require("@react-native-async-storage/async-storage").default;
} catch (e) {
  AsyncStorage = null;
}

// ⚠️ DEV ONLY — do not commit
const DEV_HARDCODE_KEYS = true;

// NOTE: Remove these from source control. Kept only to match your existing dev workflow.
// const DEV_ALPACA_KEY_ID = "REPLACE_ME";
// const DEV_ALPACA_SECRET = "REPLACE_ME";
// const DEV_TRADIER_TOKEN = "REPLACE_ME";
const DEV_FINNHUB_TOKEN = "d4vld7hr01qs25f0rcqgd4vld7hr01qs25f0rcr0";


const DEV_ALPACA_KEY_ID = "AKNND2CVUEIRFCDNVMXL2NYVWD";
const DEV_ALPACA_SECRET = "5xBdG2Go1PtWE36wnCrB4vES6mGF6tkusqDL7uSnnCxy";
const DEV_TRADIER_TOKEN = "DZi4KKhQVv05kjgqXtvJRyiFbEhn";

// Your backend stays unchanged
const DEFAULT_BACKEND = "https://advstrat-production.up.railway.app";
const DEFAULT_ALPACA_DATA_BASE = "https://data.alpaca.markets";
const DEFAULT_TRADIER_BASE = "https://api.tradier.com";
const DEFAULT_FINNHUB_BASE = "https://finnhub.io/api/v1";

const clampTop = (n) => Math.max(1, Math.min(100, Number.isFinite(n) ? n : 50));
const uniq = (arr) => Array.from(new Set((arr || []).filter(Boolean)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------
// small numeric helpers
// ---------------------------
const toNum = (v) => {
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

const midFrom = (bid, ask, last) => {
  const b = toNum(bid);
  const a = toNum(ask);
  if (b != null && a != null && b > 0 && a > 0) return (b + a) / 2;
  const l = toNum(last);
  return l != null ? l : null;
};

const fmt2 = (v) => (v == null ? "—" : Number(v).toFixed(2));

const yyyyMmDdToDte = (exp) => {
  const t = new Date(exp).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / (1000 * 60 * 60 * 24));
};

// ---------------------------
// Tradier quote normalizer
// ---------------------------
const normalizeTradierQuotes = (json) => {
  const q = json?.quotes?.quote;
  const arr = Array.isArray(q) ? q : q ? [q] : [];
  return arr
    .map((x) => {
      const symbol = x?.symbol;
      return {
        symbol,
        bid: toNum(x?.bid),
        ask: toNum(x?.ask),
        last: toNum(x?.last),
      };
    })
    .filter((x) => x.symbol);
};

async function withConcurrency(items, concurrency, worker) {
  const results = [];
  let idx = 0;
  let active = 0;

  return new Promise((resolve) => {
    const next = () => {
      if (idx >= items.length && active === 0) return resolve(results);
      while (active < concurrency && idx < items.length) {
        const cur = items[idx++];
        active++;
        Promise.resolve()
          .then(() => worker(cur))
          .then((res) => results.push(res))
          .catch((err) => results.push({ error: String(err), item: cur }))
          .finally(() => {
            active--;
            next();
          });
      }
    };
    next();
  });
}

const SmartOpportunitiesAlpacaUniverse = ({ backendUrl = DEFAULT_BACKEND }) => {
  // ---------- Universe view + company metadata ----------
  const [universeView, setUniverseView] = useState("merged"); // merged | mostActiveVolume | topTraded | gainers | losers | gapUps | gapDowns | trending
  const [companyMeta, setCompanyMeta] = useState({}); // { [SYM]: { name, sector } }
  const [companyMetaLoading, setCompanyMetaLoading] = useState(false);
  const [companyMetaError, setCompanyMetaError] = useState("");
  
  // ✅ Finnhub rate-limit circuit breaker
  const [finnhubRateLimited, setFinnhubRateLimited] = useState(false);
  const [finnhubRateLimitUntil, setFinnhubRateLimitUntil] = useState(null); 

  // ---------- Credentials / Settings ----------
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [alpacaBase, setAlpacaBase] = useState(DEFAULT_ALPACA_DATA_BASE);
  const [alpacaKeyId, setAlpacaKeyId] = useState(DEV_HARDCODE_KEYS ? DEV_ALPACA_KEY_ID : "");
  const [alpacaSecret, setAlpacaSecret] = useState(DEV_HARDCODE_KEYS ? DEV_ALPACA_SECRET : "");

  const [tradierToken, setTradierToken] = useState(DEV_HARDCODE_KEYS ? DEV_TRADIER_TOKEN : "");
  const [tradierBase, setTradierBase] = useState(DEFAULT_TRADIER_BASE);

  // ✅ NEW: Finnhub token/base (name+sector only)
  const [finnhubBase, setFinnhubBase] = useState(DEFAULT_FINNHUB_BASE);
  const [finnhubToken, setFinnhubToken] = useState(DEV_HARDCODE_KEYS ? DEV_FINNHUB_TOKEN : "");

  // Universe knobs
  const [universeTop, setUniverseTop] = useState(100);
  const [maxSymbolsToScan, setMaxSymbolsToScan] = useState(25);
  const [unusualSymbolsLimit, setUnusualSymbolsLimit] = useState(30);
  const [unusualPerSymbolMax, setUnusualPerSymbolMax] = useState(6);

  const [includeSources, setIncludeSources] = useState({
    mostActiveVolume: true,
    topTraded: true,
    moversGainers: true,
    moversLosers: true,
    gapUps: true,
    gapDowns: true,
    trending: true,
  });

  // ---------- Universe state ----------
  const [universeLoading, setUniverseLoading] = useState(false);
  const [universeError, setUniverseError] = useState("");

  const [universeMeta, setUniverseMeta] = useState({
    mostActiveVolume: [],
    topTraded: [],
    gainers: [],
    losers: [],
    gapUps: [],
    gapDowns: [],
    trending: [],
    merged: [],
    mostActiveVolumeRows: [],
    topTradedRows: [],
    gainersRows: [],
    losersRows: [],
    gapUpsRows: [],
    gapDownsRows: [],
    trendingRows: [],
    mergedRows: [],
  });

  // ---------- Opportunities scan state ----------
  const [opportunities, setOpportunities] = useState([]);
  const [mediumProbOpportunities, setMediumProbOpportunities] = useState([]);
  const [lowProbOpportunities, setLowProbOpportunities] = useState([]);
  const [nearMissOpportunities, setNearMissOpportunities] = useState([]);

  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState("");
  const [scanStoppedReason, setScanStoppedReason] = useState("");
  const [partialResults, setPartialResults] = useState(false);
  const [scanCompletedSymbols, setScanCompletedSymbols] = useState(0);

  const [selectedOpp, setSelectedOpp] = useState(null);
  const [selectedUnusual, setSelectedUnusual] = useState(null);

  const [modalTab, setModalTab] = useState("details");
  const [activeTab, setActiveTab] = useState("high");
  const [activeMainTab, setActiveMainTab] = useState("opps"); // opps | unusual | universe | portfolio

  const [filters] = useState({
    minProbability: 70,
    maxRisk: 500,
    minRewardRatio: 2,
    expiryDays: [0, 30],
    strategyTypes: ["debit-spread", "credit-spread", "iron-condor", "calendar"],
  });

  // ---------------------------
  // ✅ Paper Portfolio state
  // ---------------------------
  const [paperPortfolio, setPaperPortfolio] = useState([]);
  const [portfolioLoadingPrices, setPortfolioLoadingPrices] = useState(false);
  const [portfolioError, setPortfolioError] = useState("");
  const [portfolioLastUpdated, setPortfolioLastUpdated] = useState(null);

  // ---------------------------
  // ✅ Share Paper Trade
  // ---------------------------
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTrade, setShareTrade] = useState(null);

  const safeStr = (v) => (v == null ? "" : String(v));
  const clampLen = (s, max) => {
    const str = safeStr(s);
    return str.length > max ? str.slice(0, max - 1) + "…" : str;
  };

  const formatLeg = (leg) => {
    const side = leg?.action === "SELL" ? "SELL" : "BUY";
    const type = (leg?.optionType || "").toUpperCase() || "OPT";
    const strike = leg?.strike != null ? `$${leg.strike}` : "";
    const exp = leg?.expiration ? ` ${leg.expiration}` : "";
    return `${side} ${type} ${strike}${exp}`.trim();
  };

  const buildPaperTradePost = (t, { includeDisclaimer = true } = {}) => {
    if (!t) return "";
    const underlying = safeStr(t.underlying).toUpperCase();
    const strat = safeStr(t.strategy);
    const exp = safeStr(t.expiration);
    const qty = t.qty || 1;
    const entryValue = toNum(t.entryValue);
    const currentValue = toNum(t.currentValue);
    const pnl = toNum(t.pnl);
    const pnlPct = toNum(t.pnlPct);
    const legs = Array.isArray(t.legs) ? t.legs : [];
    const legsLine = legs.length > 0 ? legs.map(formatLeg).slice(0, 4).join(" | ") : "";
    const cashtag = underlying ? `$${underlying}` : "";

    const lines = [];
    lines.push(`🧾 PAPER TRADE IDEA: ${cashtag} — ${strat}`);
    if (exp) lines.push(`Exp: ${exp} • Qty: ${qty}`);
    if (entryValue != null) lines.push(`Entry (net): ${fmt2(entryValue)}`);
    if (currentValue != null) lines.push(`Now (net): ${fmt2(currentValue)}`);
    if (pnl != null) lines.push(`P&L: ${pnl >= 0 ? "+" : ""}$${fmt2(pnl)}${pnlPct != null ? ` (${fmt2(pnlPct)}%)` : ""}`);
    if (legsLine) lines.push(`Legs: ${legsLine}`);
    if (t.userNotes) lines.push(`Notes: ${clampLen(t.userNotes, 160)}`);
    if (includeDisclaimer) lines.push("⚠️ Paper trade. Not financial advice.");
    return lines.join("\n");
  };

  const openXComposer = async (text) => {
    const msg = safeStr(text);
    const appUrl = `x://post?text=${encodeURIComponent(msg)}`;
    const webUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg)}`;
    try {
      const can = await Linking.canOpenURL(appUrl);
      if (can) return Linking.openURL(appUrl);
    } catch {}
    return Linking.openURL(webUrl);
  };

  const shareToSystemSheet = async (text) => {
    const msg = safeStr(text);
    try {
      await Share.share({ message: msg });
    } catch (e) {
      Alert.alert("Share failed", String(e?.message || e));
    }
  };

  const copyToClipboard = async (text) => {
    const msg = safeStr(text);
    if (!Clipboard) {
      Alert.alert("Clipboard not available", "Install expo-clipboard or @react-native-clipboard/clipboard");
      return;
    }
    try {
      if (Clipboard?.setStringAsync) await Clipboard.setStringAsync(msg);
      else if (Clipboard?.setString) Clipboard.setString(msg);
      Alert.alert("Copied", "Paper trade text copied to clipboard.");
    } catch (e) {
      Alert.alert("Copy failed", String(e?.message || e));
    }
  };

  const shareToStocktwits = async (trade, text) => {
    const underlying = safeStr(trade?.underlying).toUpperCase();
    const msg = safeStr(text);
    const deepLink = "stocktwits://";
    const webSymbol = underlying ? `https://stocktwits.com/symbol/${encodeURIComponent(underlying)}` : "https://stocktwits.com";
    try {
      const can = await Linking.canOpenURL(deepLink);
      if (can) {
        await Linking.openURL(deepLink);
        await sleep(250);
        await shareToSystemSheet(msg);
        return;
      }
    } catch {}
    try {
      await Linking.openURL(webSymbol);
    } catch {}
    await shareToSystemSheet(msg);
  };

  const openShareForTrade = (t) => {
    setShareTrade(t);
    setShareOpen(true);
  };

  const renderShareModal = () => {
    if (!shareOpen || !shareTrade) return null;
    const postText = buildPaperTradePost(shareTrade, { includeDisclaimer: true });
    return (
      <Modal
        animationType="slide"
        transparent
        visible={shareOpen}
        onRequestClose={() => {
          setShareOpen(false);
          setShareTrade(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalTitle}>📣 Share Paper Trade</Text>
                <Text style={styles.modalSubtitle}>
                  {shareTrade.underlying} • {shareTrade.strategy}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  setShareOpen(false);
                  setShareTrade(null);
                }}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              <Text style={styles.modalSectionTitle}>Preview</Text>
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#F3F4F6" }}>
                <Text style={{ fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 12, fontWeight: "700", color: "#111827" }}>
                  {postText}
                </Text>
              </View>

              <View style={{ height: 14 }} />

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#111827" }]}
                onPress={async () => {
                  await openXComposer(postText);
                  setShareOpen(false);
                  setShareTrade(null);
                }}
              >
                <Text style={styles.modalButtonText}>𝕏 Post to X (prefill)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#16A34A" }]}
                onPress={async () => {
                  await shareToStocktwits(shareTrade, postText);
                  setShareOpen(false);
                  setShareTrade(null);
                }}
              >
                <Text style={styles.modalButtonText}>💬 Post to Stocktwits (share sheet)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#2563EB" }]}
                onPress={async () => {
                  await shareToSystemSheet(postText);
                }}
              >
                <Text style={styles.modalButtonText}>📲 Share (system)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: "#7C3AED" }]}
                onPress={async () => {
                  await copyToClipboard(postText);
                }}
              >
                <Text style={styles.modalButtonText}>📋 Copy text</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.secondaryButton]}
                onPress={() => {
                  setShareOpen(false);
                  setShareTrade(null);
                }}
              >
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ---------------------------
  // Persist settings (optional)
  // ---------------------------
  useEffect(() => {
    if (!AsyncStorage) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("smartOppSettingsV2"); // bump key
        if (!raw) return;
        const s = JSON.parse(raw);
        if (s.alpacaKeyId) setAlpacaKeyId(s.alpacaKeyId);
        if (s.alpacaSecret) setAlpacaSecret(s.alpacaSecret);
        if (s.alpacaBase) setAlpacaBase(s.alpacaBase);
        if (s.tradierToken) setTradierToken(s.tradierToken);
        if (s.tradierBase) setTradierBase(s.tradierBase);
        if (s.universeTop) setUniverseTop(s.universeTop);
        if (s.maxSymbolsToScan) setMaxSymbolsToScan(s.maxSymbolsToScan);
        if (s.unusualSymbolsLimit) setUnusualSymbolsLimit(s.unusualSymbolsLimit);
        if (s.unusualPerSymbolMax) setUnusualPerSymbolMax(s.unusualPerSymbolMax);
        if (s.includeSources) setIncludeSources(s.includeSources);

        // ✅ Finnhub
        if (s.finnhubBase) setFinnhubBase(s.finnhubBase);
        if (s.finnhubToken) setFinnhubToken(s.finnhubToken);
      } catch {}
    })();
  }, []);

  // Persist portfolio (optional)
  useEffect(() => {
    if (!AsyncStorage) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("paperPortfolioV1");
        if (!raw) return;
        const s = JSON.parse(raw);
        if (Array.isArray(s)) setPaperPortfolio(s);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    if (!AsyncStorage) return;
    const t = setTimeout(() => {
      AsyncStorage.setItem("paperPortfolioV1", JSON.stringify(paperPortfolio)).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [paperPortfolio]);

  const saveSettings = async () => {
    if (!AsyncStorage) return;
    try {
      await AsyncStorage.setItem(
        "smartOppSettingsV2",
        JSON.stringify({
          alpacaKeyId,
          alpacaSecret,
          alpacaBase,
          tradierToken,
          tradierBase,
          universeTop,
          maxSymbolsToScan,
          unusualSymbolsLimit,
          unusualPerSymbolMax,
          includeSources,
          finnhubBase,
          finnhubToken,
        })
      );
    } catch {}
  };

  // ---------------------------
  // Cancel scan ref
  // ---------------------------
  const cancelScanRef = useRef(false);
  useEffect(() => {
    cancelScanRef.current = !scanning;
  }, [scanning]);

  // ---------------------------
  // Alpaca helpers
  // ---------------------------
  const alpacaFetchJson = async (path, params = {}) => {
    if (!alpacaKeyId || !alpacaSecret) throw new Error("Missing Alpaca Key ID / Secret in Settings.");
    const url = new URL(`${alpacaBase}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      url.searchParams.set(k, String(v));
    });

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "APCA-API-KEY-ID": alpacaKeyId,
        "APCA-API-SECRET-KEY": alpacaSecret,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Alpaca error ${res.status}: ${text}`);
    }
    return res.json();
  };

  // ---------------------------
  // Tradier helpers
  // ---------------------------
  const tradierFetchJson = async (path, params = {}) => {
    if (!tradierToken) throw new Error("Missing Tradier token in Settings.");
    const url = new URL(`${tradierBase}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      url.searchParams.set(k, String(v));
    });

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tradierToken}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Tradier error ${res.status}: ${text}`);
    }
    return res.json();
  };

  // ✅ Tradier batched quotes (portfolio only)
  const tradierGetQuotesBatched = async (symbols, batchSize = 100) => {
    const syms = uniq(symbols);
    if (!syms.length) return {};
    const out = {};
    for (let i = 0; i < syms.length; i += batchSize) {
      const batch = syms.slice(i, i + batchSize);
      const json = await tradierFetchJson("/v1/markets/quotes", { symbols: batch.join(",") });
      const quotes = normalizeTradierQuotes(json);
      quotes.forEach((q) => {
        out[q.symbol] = q;
      });
      await sleep(80);
    }
    return out;
  };
  const tripFinnhubRateLimit = (cooldownMs = 60_000) => {
    setFinnhubRateLimited(true);
    setFinnhubRateLimitUntil(Date.now() + cooldownMs);
  };
  // ---------------------------
  // ✅ Finnhub helpers (company name + "sector" label only)
  // ---------------------------
  // const finnhubFetchJson = async (path, params = {}) => {
  //   if (!finnhubToken) throw new Error("Missing Finnhub API token in Settings.");
  //   const url = new URL(`${finnhubBase}${path}`);
  //   Object.entries(params).forEach(([k, v]) => {
  //     if (v === undefined || v === null || v === "") return;
  //     url.searchParams.set(k, String(v));
  //   });
  //   url.searchParams.set("token", finnhubToken);

  //   const res = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
  //   if (!res.ok) {
  //     const text = await res.text().catch(() => "");
  //     throw new Error(`Finnhub error ${res.status}: ${text}`);
  //   }
  //   return res.json();
  // };
  const finnhubFetchJson = async (path, params = {}) => {
    if (!finnhubToken) throw new Error("Missing Finnhub API token in Settings.");
  
    // ✅ If we're currently rate-limited, don't even try
    if (finnhubRateLimited && finnhubRateLimitUntil && Date.now() < finnhubRateLimitUntil) {
      const waitSec = Math.ceil((finnhubRateLimitUntil - Date.now()) / 1000);
      const e = new Error(`Finnhub rate-limited (cooldown ${waitSec}s)`);
      e.status = 429;
      throw e;
    }
  
    const url = new URL(`${finnhubBase}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === "") return;
      url.searchParams.set(k, String(v));
    });
    url.searchParams.set("token", finnhubToken);
  
    const res = await fetch(url.toString(), { method: "GET", headers: { Accept: "application/json" } });
  
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Finnhub error ${res.status}: ${text}`);
      err.status = res.status;
      throw err;
    }
  
    return res.json();
  };
  // /stock/profile2?symbol=AAPL -> { name, finnhubIndustry, ... }
  const finnhubGetCompanyProfile = async (symbol) => {
    const sym = String(symbol || "").toUpperCase().trim();
    if (!sym) return null;
    const j = await finnhubFetchJson("/stock/profile2", { symbol: sym });
    if (!j || Object.keys(j).length === 0) return null;

    const name = j?.name || j?.companyName || null;
    const industryAsSector = j?.finnhubIndustry || j?.industry || null;

    return {
      symbol: sym,
      name: name || null,
      sector: industryAsSector || null,
    };
  };

  const isRetryable = (err) => {
    const msg = String(err?.message || err || "");
    return /\b(429|500|502|503|504)\b/.test(msg);
  };

  // const loadCompanyMetaForSymbols = async (symbols) => {
  //   const syms = uniq(symbols)
  //     .map((s) => String(s || "").toUpperCase().trim())
  //     .filter(Boolean);

  //   if (!syms.length) return;

  //   const missing = syms.filter((s) => !companyMeta[s]);
  //   if (!missing.length) return;

  //   setCompanyMetaLoading(true);
  //   setCompanyMetaError("");

  //   try {
  //     const out = {};
  //     const concurrency = 6;
  //     const baseDelayMs = 120;

  //     const rows = await withConcurrency(missing, concurrency, async (sym) => {
  //       // basic retry loop
  //       let lastErr = null;
  //       for (let attempt = 0; attempt < 4; attempt++) {
  //         try {
  //           const prof = await finnhubGetCompanyProfile(sym);
  //           await sleep(baseDelayMs);
  //           return prof;
  //         } catch (e) {
  //           lastErr = e;
  //           if (!isRetryable(e) || attempt === 3) break;
  //           const backoff = Math.min(2000, 200 * Math.pow(2, attempt));
  //           await sleep(backoff + Math.floor(Math.random() * 100));
  //         }
  //       }
  //       // swallow error per symbol; store nothing
  //       return { symbol: sym, name: null, sector: null, _error: String(lastErr?.message || lastErr) };
  //     });

  //     rows
  //       .filter(Boolean)
  //       .forEach((r) => {
  //         if (!r?.symbol) return;
  //         out[r.symbol] = {
  //           name: r.name || null,
  //           sector: r.sector || null,
  //         };
  //       });

  //     if (Object.keys(out).length) setCompanyMeta((prev) => ({ ...prev, ...out }));
  //   } catch (e) {
  //     setCompanyMetaError(String(e?.message || e));
  //   } finally {
  //     setCompanyMetaLoading(false);
  //   }
  // };
  const loadCompanyMetaForSymbols = async (symbols) => {
    const syms = uniq(symbols)
      .map((s) => String(s || "").toUpperCase().trim())
      .filter(Boolean);
  
    if (!syms.length) return;
  
    // ✅ Only fetch missing
    const missing = syms.filter((s) => !companyMeta[s]);
    if (!missing.length) return;
  
    // ✅ If rate-limited, immediately populate placeholders and bail
    if (finnhubRateLimited && finnhubRateLimitUntil && Date.now() < finnhubRateLimitUntil) {
      const placeholders = {};
      missing.forEach((sym) => {
        placeholders[sym] = { name: null, sector: null };
      });
      setCompanyMeta((prev) => ({ ...prev, ...placeholders }));
      return;
    }
  
    setCompanyMetaLoading(true);
    setCompanyMetaError("");
  
    // ✅ shared abort flag for concurrency workers
    let stop = false;
  
    try {
      const out = {};
      const concurrency = 6;
      const baseDelayMs = 120;
  
      const rows = await withConcurrency(missing, concurrency, async (sym) => {
        // If another worker tripped rate-limit, don't keep calling Finnhub
        if (stop) return { symbol: sym, name: null, sector: null, _skipped: true };
  
        let lastErr = null;
  
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const prof = await finnhubGetCompanyProfile(sym);
            await sleep(baseDelayMs);
            return prof || { symbol: sym, name: null, sector: null };
          } catch (e) {
            lastErr = e;
  
            // ✅ If 429, trip breaker + stop all further workers
            const status = e?.status;
            const msg = String(e?.message || e || "");
            const is429 = status === 429 || /\b429\b/.test(msg) || isRateLimitError(msg);
  
            if (is429) {
              stop = true;
              tripFinnhubRateLimit(60_000); // 1 min cooldown (tune this)
              return { symbol: sym, name: null, sector: null, _error: "rate-limited" };
            }
  
            // retry only on retryables
            if (!isRetryable(e) || attempt === 3) break;
  
            const backoff = Math.min(2000, 200 * Math.pow(2, attempt));
            await sleep(backoff + Math.floor(Math.random() * 100));
          }
        }
  
        return { symbol: sym, name: null, sector: null, _error: String(lastErr?.message || lastErr) };
      });
  
      // ✅ Merge results; keep placeholders for missing so UI can still render
      rows.filter(Boolean).forEach((r) => {
        if (!r?.symbol) return;
        out[r.symbol] = { name: r.name || null, sector: r.sector || null };
      });
  
      // ✅ Ensure every missing symbol has an entry (even if null)
      missing.forEach((sym) => {
        if (!out[sym]) out[sym] = { name: null, sector: null };
      });
  
      if (Object.keys(out).length) setCompanyMeta((prev) => ({ ...prev, ...out }));
  
      // ✅ Set a friendly error message only when rate-limited
      if (stop) {
        const waitSec = finnhubRateLimitUntil ? Math.ceil((finnhubRateLimitUntil - Date.now()) / 1000) : 60;
        setCompanyMetaError(`Finnhub rate-limited — showing partial Company/Sector labels. Retry in ~${waitSec}s.`);
      }
    } catch (e) {
      setCompanyMetaError(String(e?.message || e));
    } finally {
      setCompanyMetaLoading(false);
    }
  };
  // ---------------------------
  // Universe builder (Alpaca)
  // ---------------------------
  const loadUniverseFromAlpaca = async () => {
    setUniverseLoading(true);
    setUniverseError("");

    try {
      const top = clampTop(universeTop);

      const mostActiveVolume = includeSources.mostActiveVolume
        ? await alpacaFetchJson("/v1beta1/screener/stocks/most-actives", { by: "volume", top })
        : null;

      const topTraded = includeSources.topTraded
        ? await alpacaFetchJson("/v1beta1/screener/stocks/most-actives", { by: "trades", top })
        : null;

      const movers =
        includeSources.moversGainers || includeSources.moversLosers ? await alpacaFetchJson("/v1beta1/screener/stocks/movers") : null;

      const mostActiveVolumeRowsRaw = (mostActiveVolume?.most_actives || mostActiveVolume?.mostActives || [])
        .map((x) => ({
          symbol: x.symbol,
          volume: toNum(x.volume ?? x.v ?? x.day_volume ?? x.dayVolume) ?? 0,
          trades: toNum(x.trades ?? x.trade_count ?? x.tradeCount) ?? null,
          price: toNum(x.price ?? x.last ?? x.last_price ?? x.lastPrice) ?? null,
          changePct: toNum(x.change_pct ?? x.changePercent ?? x.pct_change) ?? null,
        }))
        .filter((x) => x.symbol);

      const topTradedRowsRaw = (topTraded?.most_actives || topTraded?.mostActives || [])
        .map((x) => ({
          symbol: x.symbol,
          trades: toNum(x.trades ?? x.trade_count ?? x.tradeCount) ?? 0,
          volume: toNum(x.volume ?? x.v ?? x.day_volume ?? x.dayVolume) ?? null,
          price: toNum(x.price ?? x.last ?? x.last_price ?? x.lastPrice) ?? null,
          changePct: toNum(x.change_pct ?? x.changePercent ?? x.pct_change) ?? null,
        }))
        .filter((x) => x.symbol);

      const gainersRowsRaw = (movers?.gainers || [])
        .map((x) => ({
          symbol: x.symbol,
          price: toNum(x.price ?? x.last ?? x.last_price) ?? null,
          changePct: toNum(x.change_pct ?? x.percent_change ?? x.changePercent ?? x.pct_change) ?? null,
          volume: toNum(x.volume ?? x.v) ?? null,
        }))
        .filter((x) => x.symbol);

      const losersRowsRaw = (movers?.losers || [])
        .map((x) => ({
          symbol: x.symbol,
          price: toNum(x.price ?? x.last ?? x.last_price) ?? null,
          changePct: toNum(x.change_pct ?? x.percent_change ?? x.changePercent ?? x.pct_change) ?? null,
          volume: toNum(x.volume ?? x.v) ?? null,
        }))
        .filter((x) => x.symbol);

      const mostActiveVolumeSyms = mostActiveVolumeRowsRaw.map((x) => x.symbol);
      const topTradedSyms = topTradedRowsRaw.map((x) => x.symbol);
      const gainersSyms = gainersRowsRaw.map((x) => x.symbol);
      const losersSyms = losersRowsRaw.map((x) => x.symbol);

      const baseUnion = uniq([
        ...(includeSources.mostActiveVolume ? mostActiveVolumeSyms : []),
        ...(includeSources.topTraded ? topTradedSyms : []),
        ...(includeSources.moversGainers ? gainersSyms : []),
        ...(includeSources.moversLosers ? losersSyms : []),
      ]);

      // Snapshots for gap + trending calculations
      const chunkSize = 200;
      const snapshotMap = {};
      for (let i = 0; i < baseUnion.length; i += chunkSize) {
        const chunk = baseUnion.slice(i, i + chunkSize);
        const snap = await alpacaFetchJson("/v2/stocks/snapshots", { symbols: chunk.join(",") });
        Object.assign(snapshotMap, snap || {});
        await sleep(120);
      }

      const gapStats = baseUnion
        .map((sym) => {
          const s = snapshotMap?.[sym];
          const daily = s?.dailyBar;
          const prev = s?.prevDailyBar;
          if (!daily || !prev || !prev.c || !daily.o) return null;
          const gapPct = ((daily.o - prev.c) / prev.c) * 100;
          const dayChangePct = prev.c ? (((daily.c ?? daily.o) - prev.c) / prev.c) * 100 : null;
          const dayVol = daily.v ?? 0;
          return { symbol: sym, gapPct, dayChangePct, dayVol };
        })
        .filter(Boolean);

      const gapUpsRows = gapStats
        .slice()
        .sort((a, b) => b.gapPct - a.gapPct)
        .slice(0, top)
        .map((x) => {
          const s = snapshotMap?.[x.symbol];
          const daily = s?.dailyBar;
          const prev = s?.prevDailyBar;
          const last = s?.latestTrade?.p ?? s?.latestQuote?.ap ?? daily?.c ?? daily?.o ?? null;
          const vol = daily?.v ?? 0;
          const prevClose = prev?.c ?? null;
          const changePct = prevClose && last ? ((last - prevClose) / prevClose) * 100 : null;
          return { symbol: x.symbol, gapPct: x.gapPct, price: last, changePct, volume: vol };
        });

      const gapDownsRows = gapStats
        .slice()
        .sort((a, b) => a.gapPct - b.gapPct)
        .slice(0, top)
        .map((x) => {
          const s = snapshotMap?.[x.symbol];
          const daily = s?.dailyBar;
          const prev = s?.prevDailyBar;
          const last = s?.latestTrade?.p ?? s?.latestQuote?.ap ?? daily?.c ?? daily?.o ?? null;
          const vol = daily?.v ?? 0;
          const prevClose = prev?.c ?? null;
          const changePct = prevClose && last ? ((last - prevClose) / prevClose) * 100 : null;
          return { symbol: x.symbol, gapPct: x.gapPct, price: last, changePct, volume: vol };
        });

      const trendingRows = gapStats
        .map((x) => {
          const absMove = Math.abs(x.dayChangePct ?? 0);
          const volScore = Math.log10((x.dayVol ?? 0) + 1);
          const trendScore = absMove * 1.2 + volScore * 3;
          const s = snapshotMap?.[x.symbol];
          const daily = s?.dailyBar;
          const prev = s?.prevDailyBar;
          const last = s?.latestTrade?.p ?? s?.latestQuote?.ap ?? daily?.c ?? daily?.o ?? null;
          const vol = daily?.v ?? 0;
          const prevClose = prev?.c ?? null;
          const changePct = prevClose && last ? ((last - prevClose) / prevClose) * 100 : null;
          return { symbol: x.symbol, trendScore, gapPct: x.gapPct, price: last, changePct, volume: vol };
        })
        .sort((a, b) => b.trendScore - a.trendScore)
        .slice(0, top);

      const gapUps = gapUpsRows.map((x) => x.symbol);
      const gapDowns = gapDownsRows.map((x) => x.symbol);
      const trending = trendingRows.map((x) => x.symbol);

      const merged = uniq([
        ...(includeSources.mostActiveVolume ? mostActiveVolumeSyms : []),
        ...(includeSources.topTraded ? topTradedSyms : []),
        ...(includeSources.moversGainers ? gainersSyms : []),
        ...(includeSources.moversLosers ? losersSyms : []),
        ...(includeSources.gapUps ? gapUps : []),
        ...(includeSources.gapDowns ? gapDowns : []),
        ...(includeSources.trending ? trending : []),
      ]).slice(0, top);

      const mergedRows = merged.map((sym) => {
        const s = snapshotMap?.[sym];
        const daily = s?.dailyBar;
        const prev = s?.prevDailyBar;
        const last = s?.latestTrade?.p ?? s?.latestQuote?.ap ?? daily?.c ?? daily?.o ?? null;
        const vol = daily?.v ?? 0;
        const prevClose = prev?.c ?? null;
        const changePct = prevClose && last ? ((last - prevClose) / prevClose) * 100 : null;
        return { symbol: sym, price: last, changePct, volume: vol };
      });

      setUniverseMeta({
        mostActiveVolume: mostActiveVolumeSyms,
        topTraded: topTradedSyms,
        gainers: gainersSyms,
        losers: losersSyms,
        gapUps,
        gapDowns,
        trending,
        merged,
        mostActiveVolumeRows: mostActiveVolumeRowsRaw.slice().sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, top),
        topTradedRows: topTradedRowsRaw.slice().sort((a, b) => (b.trades ?? 0) - (a.trades ?? 0)).slice(0, top),
        gainersRows: gainersRowsRaw.slice().sort((a, b) => (b.changePct ?? -9999) - (a.changePct ?? -9999)).slice(0, top),
        losersRows: losersRowsRaw.slice().sort((a, b) => (a.changePct ?? 9999) - (b.changePct ?? 9999)).slice(0, top),
        gapUpsRows,
        gapDownsRows,
        trendingRows,
        mergedRows: mergedRows.slice().sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)),
      });

      // ✅ Finnhub: load company name/sector labels (only)
      const companySymbols = uniq([
        ...merged,
        ...mostActiveVolumeSyms,
        ...topTradedSyms,
        ...gainersSyms,
        ...losersSyms,
        ...gapUps,
        ...gapDowns,
        ...trending,
      ]).slice(0, 250);

      await loadCompanyMetaForSymbols(companySymbols);
    } catch (e) {
      setUniverseError(String(e?.message || e));
    } finally {
      setUniverseLoading(false);
    }
  };

  const openYahoo = (symbol) => {
    const url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
    Linking.openURL(url).catch(() => Alert.alert("Link error", "Could not open Yahoo Finance."));
  };

  // Try to open symbol in Thinkorswim (mobile). Falls back gracefully.
  const openThinkorswim = async (symbol) => {
    const sym = String(symbol || "").toUpperCase().trim();
    if (!sym) return;

    // Thinkorswim deep links are not consistently documented across platforms/versions.
    // We try a few common schemes. First one that can open wins.
    const candidates = [
      `thinkorswim://quote?symbol=${encodeURIComponent(sym)}`,
      `tos://quote?symbol=${encodeURIComponent(sym)}`,
      `thinkorswim://symbol/${encodeURIComponent(sym)}`,
      `tos://symbol/${encodeURIComponent(sym)}`,
    ];

    try {
      for (const url of candidates) {
        // canOpenURL often requires allowlisting schemes on iOS (see note below)
        // If canOpenURL throws, we still try openURL.
        let can = false;
        try {
          can = await Linking.canOpenURL(url);
        } catch {}

        if (can) {
          await Linking.openURL(url);
          return;
        }
      }

      // If canOpenURL returns false for everything, try opening the first candidate anyway
      // (some Android builds return false but still open).
      try {
        await Linking.openURL(candidates[0]);
        return;
      } catch {}

      // Final fallback: copy symbol so you can paste in TOS instantly
      if (Clipboard?.setStringAsync) await Clipboard.setStringAsync(sym);
      else if (Clipboard?.setString) Clipboard.setString(sym);

      Alert.alert(
        "Thinkorswim not available",
        `Couldn't deep-link into Thinkorswim. I copied ${sym} to your clipboard so you can paste it in TOS search.`
      );
    } catch (e) {
      Alert.alert("Link error", String(e?.message || e));
    }
  };

  const openThinkorswimSmart = async (symbol) => {
    const sym = String(symbol || "").toUpperCase().trim();
    if (!sym) return;
  
    // ✅ Always copy symbol so desktop workflow is 1 paste away
    try {
      if (Clipboard?.setStringAsync) await Clipboard.setStringAsync(sym);
      else if (Clipboard?.setString) Clipboard.setString(sym);
    } catch {}
  
    // ✅ Mobile deep-links (best effort)
    const candidates = [
      `thinkorswim://quote?symbol=${encodeURIComponent(sym)}`,
      `tos://quote?symbol=${encodeURIComponent(sym)}`,
      `thinkorswim://symbol/${encodeURIComponent(sym)}`,
      `tos://symbol/${encodeURIComponent(sym)}`,
    ];
  
    // ✅ If running on mobile, try to open app
    if (Platform.OS !== "web") {
      for (const url of candidates) {
        try {
          const can = await Linking.canOpenURL(url);
          if (can) {
            await Linking.openURL(url);
            return;
          }
        } catch {}
      }
    }
  
    // ✅ Desktop-friendly fallback: open browser page + symbol already copied
    // Pick ONE fallback. Schwab/TradingView/Yahoo all work.
    const webFallback = `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`;
    try {
      await Linking.openURL(webFallback);
    } catch (e) {
      Alert.alert("Open failed", `Copied ${sym} — paste it into TOS Desktop search.`);
    }
  };

  const openInThinkorswim = (symbol) => {
    // thinkorswim deep link format: tos://symbol?value=AAPL
    const tosUrl = `tos://symbol?value=${encodeURIComponent(symbol)}`;
    const webFallback = `https://www.tdameritrade.com/investment-products/options-trading.html?symbol=${encodeURIComponent(symbol)}`;
    
    Linking.canOpenURL(tosUrl)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(tosUrl);
        } else {
          // Fallback to TD Ameritrade web if thinkorswim app not installed
          return Linking.openURL(webFallback);
        }
      })
      .catch(() => {
        Alert.alert(
          "thinkorswim not available",
          "Install the thinkorswim mobile app or opening in browser.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open in Browser", onPress: () => Linking.openURL(webFallback) }
          ]
        );
      });
  };

  const isRateLimitError = (errOrText) => {
    const msg = String(errOrText || "").toLowerCase();
    return msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("429") || msg.includes("limit exceeded");
  };

  const safeJson = async (res) => {
    const text = await res.text().catch(() => "");
    try {
      return { ok: res.ok, status: res.status, json: JSON.parse(text), text };
    } catch {
      return { ok: res.ok, status: res.status, json: null, text };
    }
  };

  // ---------------------------
  // Opportunities scoring helpers (your logic)
  // ---------------------------
  const categorizeOpportunities = (allOpportunities) => {
    const highProb = [];
    const mediumProb = [];
    const lowProb = [];
    const nearMiss = [];

    allOpportunities.forEach((opp) => {
      const isNearMiss =
        (opp.probability >= 68 && opp.probability < 70) ||
        (opp.rewardRiskRatio >= 1.8 && opp.rewardRiskRatio < 2) ||
        (opp.score >= 75 && opp.score < 80);

      if (isNearMiss) {
        opp.nearMissReason = getNearMissReason(opp);
        nearMiss.push(opp);
      } else if (opp.probability >= 70) {
        highProb.push(opp);
      } else if (opp.probability >= 60) {
        mediumProb.push(opp);
      } else {
        lowProb.push(opp);
      }
    });

    return { highProb, mediumProb, lowProb, nearMiss };
  };

  const getNearMissReason = (opp) => {
    const reasons = [];
    if (opp.probability >= 68 && opp.probability < 70) reasons.push(`Probability just below threshold (${opp.probability}% vs 70%)`);
    if (opp.rewardRiskRatio >= 1.8 && opp.rewardRiskRatio < 2) reasons.push(`Reward/Risk ratio close (${opp.rewardRiskRatio}:1 vs 2:1)`);
    if (opp.score >= 75 && opp.score < 80) reasons.push(`Overall score near threshold (${opp.score} vs 80)`);
    return reasons.join(", ");
  };

  const calculateScore = (probability, rewardRatio, daysToExpiry, iv) => {
    const probScore = probability * 0.35;
    const ratioScore = typeof rewardRatio === "number" ? Math.min(10, rewardRatio) * 5.5 : 30;
    const timeScore = Math.max(0, 25 - daysToExpiry / 2);
    const ivScore = iv < 0.4 ? 10 : iv > 0.6 ? 5 : 8;
    return Math.min(100, probScore + ratioScore + timeScore + ivScore);
  };

  const findStrike = (options, targetPrice) => {
    return options.find((o) => Math.abs(o.strike - targetPrice) / targetPrice < 0.02) || options[0];
  };

  const createOpportunity = (symbol, strategy, type, expiration, daysToExpiry, cost, maxLoss, maxProfit, probability, avgIV, setup, greeks, reason, currentPrice) => {
    const rewardRiskRatio =
      typeof maxLoss === "number" && maxLoss > 0 ? (typeof maxProfit === "number" ? maxProfit / maxLoss : 3) : "N/A";
    const score = calculateScore(probability, rewardRiskRatio, daysToExpiry, avgIV);

    return {
      id: `${symbol}-${strategy}-${expiration}-${Math.random().toString(36).slice(2)}`,
      symbol,
      strategy,
      type,
      expiration,
      daysToExpiry,
      cost: typeof cost === "number" ? cost.toFixed(2) : cost,
      maxLoss: typeof maxLoss === "number" ? maxLoss.toFixed(2) : maxLoss,
      maxProfit: typeof maxProfit === "number" ? maxProfit.toFixed(2) : maxProfit,
      rewardRiskRatio: typeof rewardRiskRatio === "number" ? rewardRiskRatio.toFixed(2) : rewardRiskRatio,
      probability: Math.round(probability),
      ivPercentile: Math.round(Math.min(95, avgIV * 100)),
      setup,
      greeks,
      reason,
      currentPrice,
      score: Math.round(score),
      timestamp: new Date().toISOString(),
    };
  };

  const enrichLeg = (opt) => {
    if (!opt) return {};
    return {
      symbol: opt.symbol || opt.option_symbol || opt.oc_symbol || null,
      bid: toNum(opt.bid),
      ask: toNum(opt.ask),
      last: toNum(opt.last),
      strike: toNum(opt.strike),
      optionType: opt.option_type || opt.optionType || opt.type || null,
      expiration: opt.expiration || opt.expiration_date || null,
    };
  };

  const generateOpportunitiesByProbability = (symbol, expiration, daysToExpiry, currentPrice, calls, puts, avgIV, withinRange) => {
    const opportunitiesLocal = [];

    if (withinRange && avgIV > 0.35) {
      const shortCall = findStrike(calls, currentPrice * 1.03);
      const longCall = findStrike(calls, currentPrice * 1.05);
      const shortPut = findStrike(puts, currentPrice * 0.97);
      const longPut = findStrike(puts, currentPrice * 0.95);

      if (shortCall && longCall && shortPut && longPut) {
        const credit = (shortCall.bid + shortPut.bid) - (longCall.ask + longPut.ask);
        const width = Math.abs(shortCall.strike - longCall.strike);
        const maxLoss = width * 100 - credit;
        const probability = Math.min(85, 75 + avgIV * 20);

        opportunitiesLocal.push(
          createOpportunity(
            symbol,
            "Iron Condor",
            "iron-condor",
            expiration,
            daysToExpiry,
            credit,
            maxLoss,
            credit,
            probability,
            avgIV,
            {
              shortCall: shortCall.strike,
              longCall: longCall.strike,
              shortPut: shortPut.strike,
              longPut: longPut.strike,
              shortCall_leg: enrichLeg(shortCall),
              longCall_leg: enrichLeg(longCall),
              shortPut_leg: enrichLeg(shortPut),
              longPut_leg: enrichLeg(longPut),
            },
            { delta: 0.03, theta: 0.22, vega: -0.1 },
            "High IV environment with wide strike placement",
            currentPrice
          )
        );
      }
    }

    if (withinRange) {
      const longCall = findStrike(calls, currentPrice);
      const shortCall = findStrike(calls, currentPrice * 1.02);
      if (longCall && shortCall) {
        const debit = longCall.ask - shortCall.bid;
        const width = Math.abs(shortCall.strike - longCall.strike);
        const maxProfit = width * 100 - debit;
        const probability = 65 + (0.3 - Math.min(avgIV, 0.3)) * 50;

        opportunitiesLocal.push(
          createOpportunity(
            symbol,
            "Bull Call Spread",
            "debit-spread",
            expiration,
            daysToExpiry,
            debit,
            debit,
            maxProfit,
            probability,
            avgIV,
            { longCall: longCall.strike, shortCall: shortCall.strike, longCall_leg: enrichLeg(longCall), shortCall_leg: enrichLeg(shortCall) },
            { delta: 0.35, theta: -0.12, vega: 0.08 },
            "Moderate IV with directional bias",
            currentPrice
          )
        );
      }

      const longPut = findStrike(puts, currentPrice);
      const shortPut = findStrike(puts, currentPrice * 0.98);
      if (longPut && shortPut) {
        const debit = longPut.ask - shortPut.bid;
        const width = Math.abs(shortPut.strike - longPut.strike);
        const maxProfit = width * 100 - debit;

        opportunitiesLocal.push(
          createOpportunity(
            symbol,
            "Bear Put Spread",
            "debit-spread",
            expiration,
            daysToExpiry,
            debit,
            debit,
            maxProfit,
            63,
            avgIV,
            { longPut: longPut.strike, shortPut: shortPut.strike, longPut_leg: enrichLeg(longPut), shortPut_leg: enrichLeg(shortPut) },
            { delta: -0.35, theta: -0.11, vega: 0.07 },
            "Downside protection with moderate probability",
            currentPrice
          )
        );
      }
    }

    // near-miss generator
    if (withinRange) {
      const shortCall = findStrike(calls, currentPrice * 1.02);
      const longCall = findStrike(calls, currentPrice * 1.035);
      const shortPut = findStrike(puts, currentPrice * 0.98);
      const longPut = findStrike(puts, currentPrice * 0.965);

      if (shortCall && longCall && shortPut && longPut) {
        const credit = (shortCall.bid + shortPut.bid) - (longCall.ask + longPut.ask);
        const width = Math.abs(shortCall.strike - longCall.strike);
        const maxLoss = width * 100 - credit;

        opportunitiesLocal.push(
          createOpportunity(
            symbol,
            "Iron Condor (Near Miss)",
            "iron-condor",
            expiration,
            daysToExpiry,
            credit,
            maxLoss,
            credit,
            68,
            avgIV,
            {
              shortCall: shortCall.strike,
              longCall: longCall.strike,
              shortPut: shortPut.strike,
              longPut: longPut.strike,
              shortCall_leg: enrichLeg(shortCall),
              longCall_leg: enrichLeg(longCall),
              shortPut_leg: enrichLeg(shortPut),
              longPut_leg: enrichLeg(longPut),
            },
            { delta: 0.05, theta: 0.2, vega: -0.12 },
            "Narrow strikes, probability just below threshold",
            currentPrice
          )
        );
      }
    }

    return opportunitiesLocal;
  };

  const analyzeSymbol = async (symbol, quote, options) => {
    const all = [];
    const currentPrice = quote.last;
    if (!options || options.length === 0) return all;

    const expirations = {};
    options.forEach((opt) => {
      if (!expirations[opt.expiration]) expirations[opt.expiration] = [];
      expirations[opt.expiration].push(opt);
    });

    for (const [expiration, expOptions] of Object.entries(expirations)) {
      const daysToExpiry = Math.ceil((new Date(expiration) - new Date()) / (1000 * 60 * 60 * 24));
      const withinRange = daysToExpiry >= filters.expiryDays[0] && daysToExpiry <= filters.expiryDays[1];
      const calls = expOptions.filter((o) => o.type === "call");
      const puts = expOptions.filter((o) => o.type === "put");
      if (!calls.length || !puts.length) continue;

      const avgIV = expOptions.reduce((sum, o) => sum + (o.iv || 0), 0) / expOptions.length;
      all.push(...generateOpportunitiesByProbability(symbol, expiration, daysToExpiry, currentPrice, calls, puts, avgIV, withinRange));
    }
    return all;
  };

  // ---------------------------
  // Scan opportunities using Alpaca-derived universe
  // ---------------------------
  const symbolsToScan = useMemo(() => (universeMeta.merged || []).slice(0, Math.max(1, maxSymbolsToScan)), [universeMeta.merged, maxSymbolsToScan]);

  const scanOpportunities = async () => {
    if (!symbolsToScan.length) {
      Alert.alert("No symbols", "Load Universe from Alpaca first (Universe tab).");
      return;
    }

    setLoading(true);
    setScanning(true);
    cancelScanRef.current = false;
    setScanProgress(0);
    setScanStatus("Initializing scan...");
    setScanStoppedReason("");
    setPartialResults(false);
    setScanCompletedSymbols(0);

    const allOpportunities = [];
    let completed = 0;
    let stoppedReasonLocal = "";

    try {
      for (let i = 0; i < symbolsToScan.length; i++) {
        // if (!scanning) {
        if (cancelScanRef.current) {
          // user hit cancel UI
          setScanStoppedReason("cancelled");
          setPartialResults(allOpportunities.length > 0);
          break;
        }

        if (cancelScanRef.current) {
          setScanStoppedReason("cancelled");
          setPartialResults(allOpportunities.length > 0);
          break;
        }

        const symbol = symbolsToScan[i];
        setScanStatus(`Analyzing ${symbol} (${i + 1}/${symbolsToScan.length})...`);

        try {
          const quoteRes = await fetch(`${backendUrl}/market/quote/${symbol}`);
          const quoteParsed = await safeJson(quoteRes);
          if (!quoteParsed.ok) {
            if (quoteParsed.status === 429 || isRateLimitError(quoteParsed.text)) {
              setScanStoppedReason("rate-limited");
              setPartialResults(allOpportunities.length > 0);
              break;
            }
            continue;
          }

          const quoteData = quoteParsed.json;
          if (!quoteData?.success || !quoteData?.last) continue;

          const optRes = await fetch(`${backendUrl}/options/chain/${symbol}`);
          const optParsed = await safeJson(optRes);
          if (!optParsed.ok) {
            if (optParsed.status === 429 || isRateLimitError(optParsed.text)) {
              setScanStoppedReason("rate-limited");
              setPartialResults(allOpportunities.length > 0);
              break;
            }
            continue;
          }

          const optionsData = optParsed.json;
          if (!optionsData?.success || !optionsData?.options) continue;

          const symbolOpps = await analyzeSymbol(symbol, quoteData, optionsData.options);
          if (symbolOpps?.length) allOpportunities.push(...symbolOpps);

          completed++;
          setScanCompletedSymbols(completed);
        } catch (err) {
          if (isRateLimitError(err?.message || err)) {
            stoppedReasonLocal = "rate-limited";
            setScanStoppedReason("rate-limited");
            setPartialResults(allOpportunities.length > 0);
            break;
          }
        }

        setScanProgress(((i + 1) / symbolsToScan.length) * 100);
        await sleep(150);
      }

      const { highProb, mediumProb, lowProb, nearMiss } = categorizeOpportunities(allOpportunities);
      const sortByScore = (a, b) => b.score - a.score;

      setOpportunities(highProb.sort(sortByScore));
      setMediumProbOpportunities(mediumProb.sort(sortByScore));
      setLowProbOpportunities(lowProb.sort(sortByScore));
      setNearMissOpportunities(nearMiss.sort(sortByScore));

      if (stoppedReasonLocal === "rate-limited") {
        setScanStatus(`Rate-limited — showing partial results (${completed}/${symbolsToScan.length} symbols).`);
      } else {
        setScanStatus(`Found ${allOpportunities.length} total opportunities`);
      }
    } catch (error) {
      setPartialResults(allOpportunities.length > 0);
      Alert.alert("Scan Error", `Scan stopped: ${error?.message || String(error)}`);
    } finally {
      setLoading(false);
      setTimeout(() => {
        setScanning(false);
        setScanProgress(100);
      }, 250);
    }
  };

  // ---------------------------
  // Tradier Unusual Options Activity (computed)
  // ---------------------------
  const computeUnusualFromChain = (underlying, chain, maxPerSymbol) => {
    const options = chain?.options?.option;
    const list = Array.isArray(options) ? options : options ? [options] : [];

    const scored = list
      .map((o) => {
        const vol = Number(o.volume || 0);
        const oi = Number(o.open_interest || 0);
        const iv = Number(o.iv || 0);
        const delta = o.greeks?.delta ?? o.delta ?? null;

        const voiRaw = (vol + 1) / (oi + 1);
        const voi = Math.min(20, voiRaw);
        const volFloorOk = vol >= 200;

        const score = voi * 10 + Math.min(8, iv * 10) + Math.min(6, vol / 1000);

        return {
          underlying,
          symbol: o.symbol,
          optionType: o.option_type || o.optionType || o.type,
          strike: o.strike,
          expiration: o.expiration_date || o.expiration,
          bid: o.bid,
          ask: o.ask,
          last: o.last,
          volume: vol,
          openInterest: oi,
          iv,
          delta,
          voi: Number.isFinite(voi) ? voi : null,
          score,
          reason: `Vol/OI=${voi.toFixed(2)} • Vol=${vol} • OI=${oi} • IV=${(iv * 100).toFixed(1)}%`,
          volFloorOk,
        };
      })
      .filter((x) => x.volFloorOk)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPerSymbol);

    return scored;
  };

  const [unusualLoading, setUnusualLoading] = useState(false);
  const [unusualError, setUnusualError] = useState("");
  const [unusualList, setUnusualList] = useState([]);

  const loadUnusualOptions = async () => {
    if (!symbolsToScan.length) {
      Alert.alert("No symbols", "Load Universe from Alpaca first.");
      return;
    }

    setUnusualLoading(true);
    setUnusualError("");
    setUnusualList([]);

    try {
      const targets = symbolsToScan.slice(0, Math.max(1, unusualSymbolsLimit));
      const perSymbol = await withConcurrency(targets, 3, async (sym) => {
        const exps = await tradierFetchJson("/v1/markets/options/expirations", { symbol: sym, includeAllRoots: "true" });
        const dates = exps?.expirations?.date;
        const expList = Array.isArray(dates) ? dates : dates ? [dates] : [];
        if (!expList.length) return [];

        const now = Date.now();
        const picked = expList
          .map((d) => ({ d, t: new Date(d).getTime() }))
          .filter((x) => x.t > now + 3 * 24 * 60 * 60 * 1000)
          .sort((a, b) => a.t - b.t)[0]?.d;

        if (!picked) return [];

        const chain = await tradierFetchJson("/v1/markets/options/chains", { symbol: sym, expiration: picked, greeks: "true" });
        return computeUnusualFromChain(sym, chain, unusualPerSymbolMax);
      });

      const flat = perSymbol.flat().filter(Boolean);
      flat.sort((a, b) => b.score - a.score);
      setUnusualList(flat);
    } catch (e) {
      setUnusualError(String(e?.message || e));
    } finally {
      setUnusualLoading(false);
    }
  };

  // ---------------------------
  // Paper Portfolio mechanics
  // ---------------------------
  const removePaperTrade = (tradeId) => setPaperPortfolio((prev) => prev.filter((t) => t.id !== tradeId));

  const updatePaperTradeNotes = (tradeId, patch) => {
    setPaperPortfolio((prev) => prev.map((t) => (t.id === tradeId ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)));
  };

  const buildLegsFromOpportunity = (opp) => {
    const exp = opp.expiration;
    const legs = [];

    const pushLeg = (action, optionType, strike, symMaybe, bidMaybe, askMaybe, lastMaybe) => {
      legs.push({
        action,
        optionType,
        strike: toNum(strike),
        expiration: exp,
        symbol: symMaybe || null,
        entryBid: toNum(bidMaybe),
        entryAsk: toNum(askMaybe),
        entryLast: toNum(lastMaybe),
      });
    };

    if (opp.type === "iron-condor" && opp.setup?.shortCall != null) {
      const sc = opp.setup.shortCall_leg || {};
      const lc = opp.setup.longCall_leg || {};
      const sp = opp.setup.shortPut_leg || {};
      const lp = opp.setup.longPut_leg || {};
      pushLeg("SELL", "call", opp.setup.shortCall, sc.symbol, sc.bid, sc.ask, sc.last);
      pushLeg("BUY", "call", opp.setup.longCall, lc.symbol, lc.bid, lc.ask, lc.last);
      pushLeg("SELL", "put", opp.setup.shortPut, sp.symbol, sp.bid, sp.ask, sp.last);
      pushLeg("BUY", "put", opp.setup.longPut, lp.symbol, lp.bid, lp.ask, lp.last);
      return legs;
    }

    if (opp.strategy === "Bull Call Spread" && opp.setup?.longCall != null) {
      const lc = opp.setup.longCall_leg || {};
      const sc = opp.setup.shortCall_leg || {};
      pushLeg("BUY", "call", opp.setup.longCall, lc.symbol, lc.bid, lc.ask, lc.last);
      pushLeg("SELL", "call", opp.setup.shortCall, sc.symbol, sc.bid, sc.ask, sc.last);
      return legs;
    }

    if (opp.strategy === "Bear Put Spread" && opp.setup?.longPut != null) {
      const lp = opp.setup.longPut_leg || {};
      const sp = opp.setup.shortPut_leg || {};
      pushLeg("BUY", "put", opp.setup.longPut, lp.symbol, lp.bid, lp.ask, lp.last);
      pushLeg("SELL", "put", opp.setup.shortPut, sp.symbol, sp.bid, sp.ask, sp.last);
      return legs;
    }

    return legs;
  };

  const computeEntryValueFromOpp = (opp, legs) => {
    const costNum = toNum(opp.cost);
    if (costNum == null) return null;

    const allLegHaveEntry = legs.every((l) => midFrom(l.entryBid, l.entryAsk, l.entryLast) != null);
    if (allLegHaveEntry) {
      let v = 0;
      legs.forEach((l) => {
        const m = midFrom(l.entryBid, l.entryAsk, l.entryLast);
        const sign = l.action === "BUY" ? 1 : -1;
        v += sign * m;
      });
      return v;
    }

    if (opp.type === "credit-spread" || opp.type === "iron-condor" || String(opp.strategy || "").toLowerCase().includes("condor")) {
      return -Math.abs(costNum);
    }
    return Math.abs(costNum);
  };

  const addPaperTradeFromOpportunity = (opp) => {
    try {
      const legs = buildLegsFromOpportunity(opp);
      if (!legs.length) {
        Alert.alert("Can't add trade", "This opportunity type doesn't include enough leg info to paper trade.");
        return;
      }

      const entryValue = computeEntryValueFromOpp(opp, legs);

      const trade = {
        id: `pt-opp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        source: "smart-opportunity",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        underlying: opp.symbol,
        strategy: opp.strategy,
        type: opp.type,
        expiration: opp.expiration,
        dteAtEntry: opp.daysToExpiry ?? yyyyMmDdToDte(opp.expiration),
        qty: 1,
        entryValue,
        entryLabel: opp.type === "iron-condor" ? `Credit ~$${opp.cost}` : `Debit ~$${opp.cost}`,
        legs,
        whySpotted: opp.reason || "",
        userNotes: "",
        meta: {
          probability: opp.probability,
          score: opp.score,
          rr: opp.rewardRiskRatio,
          maxLoss: opp.maxLoss,
          maxProfit: opp.maxProfit,
          ivp: opp.ivPercentile,
          setup: opp.setup,
        },
        lastPriceUpdateAt: null,
        currentValue: null,
        pnl: null,
        pnlPct: null,
      };

      setPaperPortfolio((prev) => [trade, ...prev]);
      Alert.alert("Added to Portfolio", 'Paper trade added. Go to Portfolio tab and press "Get Current Prices" to update P&L.');
    } catch (e) {
      Alert.alert("Error", String(e?.message || e));
    }
  };

  const addPaperTradeFromUnusual = (u) => {
    const entryMid = midFrom(u.bid, u.ask, u.last);
    const trade = {
      id: `pt-unusual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      source: "unusual-options",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      underlying: u.underlying,
      strategy: "Unusual Options (Single)",
      type: "single",
      expiration: u.expiration,
      dteAtEntry: yyyyMmDdToDte(u.expiration),
      qty: 1,
      entryValue: entryMid != null ? +entryMid : null,
      entryLabel: entryMid != null ? `Mid ~$${fmt2(entryMid)}` : "Mid unavailable",
      legs: [
        {
          action: "BUY",
          optionType: String(u.optionType || "").toLowerCase().includes("put") ? "put" : "call",
          strike: toNum(u.strike),
          expiration: u.expiration,
          symbol: u.symbol || null,
          entryBid: toNum(u.bid),
          entryAsk: toNum(u.ask),
          entryLast: toNum(u.last),
        },
      ],
      whySpotted: u.reason || "",
      userNotes: "",
      meta: { score: u.score, voi: u.voi, volume: u.volume, openInterest: u.openInterest, iv: u.iv, delta: u.delta },
      lastPriceUpdateAt: null,
      currentValue: null,
      pnl: null,
      pnlPct: null,
    };

    setPaperPortfolio((prev) => [trade, ...prev]);
    Alert.alert("Added to Portfolio", 'Paper trade added. Go to Portfolio tab and press "Get Current Prices" to update P&L.');
  };

  const resolveMissingLegSymbols = async (trades) => {
    const needs = [];
    trades.forEach((t) => {
      (t.legs || []).forEach((l) => {
        if (!l.symbol && t.underlying && l.expiration) needs.push(`${t.underlying}@@${l.expiration}`);
      });
    });

    const uniqNeeds = uniq(needs);
    if (!uniqNeeds.length) return trades;

    const chainCache = {};

    for (let i = 0; i < uniqNeeds.length; i++) {
      const key = uniqNeeds[i];
      const [underlying, expiration] = key.split("@@");
      try {
        const chain = await tradierFetchJson("/v1/markets/options/chains", { symbol: underlying, expiration, greeks: "false" });
        const list = chain?.options?.option;
        chainCache[key] = Array.isArray(list) ? list : list ? [list] : [];
      } catch {
        chainCache[key] = [];
      }
      await sleep(80);
    }

    return trades.map((t) => {
      const legs = (t.legs || []).map((l) => {
        if (l.symbol) return l;
        const key = `${t.underlying}@@${l.expiration}`;
        const arr = chainCache[key] || [];
        const targetStrike = toNum(l.strike);
        const match = arr.find((o) => {
          const oType = String(o.option_type || o.optionType || o.type || "").toLowerCase();
          const oStrike = toNum(o.strike);
          return oType === String(l.optionType).toLowerCase() && oStrike != null && targetStrike != null && Math.abs(oStrike - targetStrike) < 1e-9;
        });
        if (!match?.symbol) return l;
        return { ...l, symbol: match.symbol };
      });
      return { ...t, legs };
    });
  };

  const updatePortfolioPrices = async () => {
    if (!paperPortfolio.length) {
      Alert.alert("Portfolio empty", "Add a paper trade from Opportunities or Unusual Options first.");
      return;
    }

    setPortfolioLoadingPrices(true);
    setPortfolioError("");

    try {
      let trades = await resolveMissingLegSymbols(paperPortfolio);

      const optionSymbols = [];
      trades.forEach((t) => (t.legs || []).forEach((l) => l.symbol && optionSymbols.push(l.symbol)));
      const uniqOptionSymbols = uniq(optionSymbols);

      if (!uniqOptionSymbols.length) {
        Alert.alert("No symbols", "Could not resolve option symbols for portfolio trades.");
        setPaperPortfolio(trades);
        return;
      }

      const quoteMap = await tradierGetQuotesBatched(uniqOptionSymbols, 120);

      const updated = trades.map((t) => {
        const qty = toNum(t.qty) || 1;
        let cur = 0;
        let any = false;

        const legs = (t.legs || []).map((l) => {
          const q = l.symbol ? quoteMap[l.symbol] : null;
          const m = q ? midFrom(q.bid, q.ask, q.last) : null;
          const sign = l.action === "BUY" ? 1 : -1;
          if (m != null) {
            cur += sign * m;
            any = true;
          }
          return { ...l, lastMid: m, lastBid: q?.bid ?? null, lastAsk: q?.ask ?? null, lastLast: q?.last ?? null };
        });

        const entryValue = toNum(t.entryValue);
        const currentValue = any ? cur : null;

        let pnl = null;
        let pnlPct = null;
        if (entryValue != null && currentValue != null) {
          pnl = (currentValue - entryValue) * 100 * qty;
          const denom = Math.abs(entryValue * 100 * qty);
          pnlPct = denom > 0 ? (pnl / denom) * 100 : null;
        }

        return { ...t, legs, currentValue, pnl, pnlPct, lastPriceUpdateAt: new Date().toISOString() };
      });

      setPaperPortfolio(updated);
      setPortfolioLastUpdated(new Date().toISOString());
    } catch (e) {
      setPortfolioError(String(e?.message || e));
    } finally {
      setPortfolioLoadingPrices(false);
    }
  };

  // ---------------------------
  // UI helpers
  // ---------------------------
  const getCurrentOpportunities = () => {
    switch (activeTab) {
      case "high":
        return opportunities;
      case "medium":
        return mediumProbOpportunities;
      case "low":
        return lowProbOpportunities;
      case "near-miss":
        return nearMissOpportunities;
      default:
        return opportunities;
    }
  };

  const getStrategyColor = (type) => {
    switch (type) {
      case "credit-spread":
        return "#10B981";
      case "debit-spread":
        return "#3B82F6";
      case "iron-condor":
        return "#8B5CF6";
      case "theta-decay":
        return "#F59E0B";
      case "volatility":
        return "#EC4899";
      default:
        return "#6B7280";
    }
  };

  const getRiskColor = (probability) => {
    if (probability >= 70) return "#10B981";
    if (probability >= 60) return "#F59E0B";
    if (probability >= 50) return "#EF4444";
    return "#6B7280";
  };

  const getUniverseViewRows = () => {
    switch (universeView) {
      case "mostActiveVolume":
        return universeMeta.mostActiveVolumeRows || [];
      case "topTraded":
        return universeMeta.topTradedRows || [];
      case "gainers":
        return universeMeta.gainersRows || [];
      case "losers":
        return universeMeta.losersRows || [];
      case "gapUps":
        return universeMeta.gapUpsRows || [];
      case "gapDowns":
        return universeMeta.gapDownsRows || [];
      case "trending":
        return universeMeta.trendingRows || [];
      case "merged":
      default:
        return universeMeta.mergedRows || [];
    }
  };

  const getCompanyLabel = (sym) => {
    const m = companyMeta?.[String(sym || "").toUpperCase()];
    return { name: m?.name || "—", sector: m?.sector || "—" };
  };

  const sectorStats = useMemo(() => {
    const syms = (universeMeta.merged || []).slice(0, 100);
    const counts = {};
    let known = 0;

    for (const sym of syms) {
      const s = (companyMeta?.[String(sym).toUpperCase()]?.sector || "").trim();
      const sector = s || "Unknown";
      counts[sector] = (counts[sector] || 0) + 1;
      if (sector !== "Unknown") known++;
    }

    const total = syms.length || 1;
    const rows = Object.entries(counts)
      .map(([sector, count]) => ({ sector, count, pct: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);

    return { total, known, rows };
  }, [universeMeta.merged, companyMeta]);

  const renderSectorDistribution = () => {
    const rows = sectorStats.rows || [];
    if (!rows.length) return null;

    const topN = 7;
    const topRows = rows.slice(0, topN);
    const rest = rows.slice(topN);
    const otherCount = rest.reduce((s, r) => s + r.count, 0);
    const total = sectorStats.total || 1;
    const finalRows = otherCount > 0 ? [...topRows, { sector: "Other", count: otherCount, pct: (otherCount / total) * 100 }] : topRows;

    return (
      <View style={styles.sectorCard}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text style={styles.sectorTitle}>Sector Mix (Merged)</Text>
          <Text style={styles.sectorSub}>
            {sectorStats.known}/{sectorStats.total} labeled
          </Text>
        </View>

        <View style={styles.sectorBar}>
          {finalRows.map((r) => (
            <View key={r.sector} style={[styles.sectorSlice, { flex: Math.max(0.01, r.pct) }]} />
          ))}
        </View>

        <View style={{ marginTop: 10 }}>
          {finalRows.map((r) => (
            <View key={`leg-${r.sector}`} style={styles.sectorLegendRow}>
              <Text style={styles.sectorLegendText} numberOfLines={1}>
                {r.sector}
              </Text>
              <Text style={styles.sectorLegendPct}>
                {r.count} • {r.pct.toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectorHint}>Tip: hit “Refresh Names/Sectors” if you see lots of Unknown.</Text>
      </View>
    );
  };

  // ---------------------------
  // Opportunity UI
  // ---------------------------
  const renderProbabilityTabs = () => {
    const tabs = [
      { id: "high", label: "High", count: opportunities.length, color: "#10B981" },
      { id: "medium", label: "Medium", count: mediumProbOpportunities.length, color: "#F59E0B" },
      { id: "low", label: "Low", count: lowProbOpportunities.length, color: "#EF4444" },
      { id: "near-miss", label: "Near Miss", count: nearMissOpportunities.length, color: "#8B5CF6" },
    ];

    return (
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tabsInner}>
            {tabs.map((tab) => (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, activeTab === tab.id && styles.activeTab, activeTab === tab.id && { borderBottomColor: tab.color }]}
                onPress={() => setActiveTab(tab.id)}
              >
                <View style={styles.tabContent}>
                  <Text style={[styles.tabLabel, activeTab === tab.id && styles.activeTabLabel, activeTab === tab.id && { color: tab.color }]}>
                    {tab.label}
                  </Text>
                  <View style={[styles.countBadge, { backgroundColor: tab.color + "20" }]}>
                    <Text style={[styles.countText, { color: tab.color }]}>{tab.count}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderOpportunityCard = (opp) => {
    const strategyColor = getStrategyColor(opp.type);
    const riskColor = getRiskColor(opp.probability);

    return (
      <TouchableOpacity key={opp.id} style={styles.opportunityCard} onPress={() => setSelectedOpp(opp)}>
        <View style={styles.opportunityHeader}>
          <View style={styles.symbolContainer}>
            <Text style={styles.symbolText}>{opp.symbol}</Text>
            <View style={[styles.strategyBadge, { backgroundColor: strategyColor + "20" }]}>
              <Text style={[styles.strategyText, { color: strategyColor }]}>{opp.strategy}</Text>
            </View>
          </View>
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>Score</Text>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreText}>{opp.score}</Text>
            </View>
          </View>
        </View>

        {activeTab === "near-miss" && opp.nearMissReason ? (
          <View style={styles.nearMissBadge}>
            <Text style={styles.nearMissText}>⚠️ {opp.nearMissReason}</Text>
          </View>
        ) : null}

        <View style={styles.opportunityDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Probability</Text>
              <View style={styles.probabilityBar}>
                <View style={[styles.probabilityFill, { width: `${opp.probability}%`, backgroundColor: riskColor }]} />
              </View>
              <Text style={[styles.detailValue, { color: riskColor }]}>{opp.probability}%</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Risk/Reward</Text>
              <Text style={styles.detailValue}>{opp.rewardRiskRatio}:1</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Max Profit</Text>
              <Text style={[styles.detailValue, styles.profitText]}>${opp.maxProfit}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Max Loss</Text>
              <Text style={[styles.detailValue, styles.lossText]}>${opp.maxLoss}</Text>
            </View>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Days</Text>
              <Text style={styles.detailValue}>{opp.daysToExpiry}</Text>
            </View>
          </View>

          {opp.reason ? <Text style={styles.reasonText}>{opp.reason}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  // const renderOpportunityModal = () => {
  //   if (!selectedOpp) return null;
  //   const strategyColor = getStrategyColor(selectedOpp.type);

  //   return (
  //     <Modal animationType="slide" transparent visible={!!selectedOpp} onRequestClose={() => setSelectedOpp(null)}>
  //       <View style={styles.modalOverlay}>
  //         <View style={styles.modalContent}>
  //           <View style={styles.modalHeader}>
  //             <View>
  //               <Text style={styles.modalTitle}>
  //                 {selectedOpp.symbol} - {selectedOpp.strategy}
  //               </Text>
  //               <Text style={styles.modalSubtitle}>
  //                 {selectedOpp.probability}% Probability • Score: {selectedOpp.score}
  //               </Text>
  //             </View>
  //             <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedOpp(null)}>
  //               <Text style={styles.modalClose}>✕</Text>
  //             </TouchableOpacity>
  //           </View>

  //           <View style={styles.modalTabs}>
  //             <TouchableOpacity
  //               style={[styles.modalTab, modalTab === "details" && styles.activeModalTab]}
  //               onPress={() => setModalTab("details")}
  //             >
  //               <Text style={[styles.modalTabText, modalTab === "details" && styles.activeModalTabText]}>Details</Text>
  //             </TouchableOpacity>

  //             <TouchableOpacity style={[styles.modalTab, modalTab === "setup" && styles.activeModalTab]} onPress={() => setModalTab("setup")}>
  //               <Text style={[styles.modalTabText, modalTab === "setup" && styles.activeModalTabText]}>Setup</Text>
  //             </TouchableOpacity>
  //           </View>

  //           <View style={styles.modalBody}>
  //             {modalTab === "details" ? (
  //               <ScrollView>
  //                 <View style={styles.modalSection}>
  //                   <Text style={styles.modalSectionTitle}>Trade Details</Text>
  //                   <View style={styles.modalGrid}>
  //                     <View style={styles.modalItem}>
  //                       <Text style={styles.modalLabel}>Current Price</Text>
  //                       <Text style={styles.modalValue}>${selectedOpp.currentPrice?.toFixed(2) || "N/A"}</Text>
  //                     </View>
  //                     <View style={styles.modalItem}>
  //                       <Text style={styles.modalLabel}>Expiration</Text>
  //                       <Text style={styles.modalValue}>{selectedOpp.expiration}</Text>
  //                     </View>
  //                     <View style={styles.modalItem}>
  //                       <Text style={styles.modalLabel}>DTE</Text>
  //                       <Text style={styles.modalValue}>{selectedOpp.daysToExpiry}</Text>
  //                     </View>
  //                     <View style={styles.modalItem}>
  //                       <Text style={styles.modalLabel}>IV%</Text>
  //                       <Text style={styles.modalValue}>{selectedOpp.ivPercentile}%</Text>
  //                     </View>
  //                   </View>
  //                 </View>

  //                 <View style={styles.modalSection}>
  //                   <Text style={styles.modalSectionTitle}>Risk</Text>
  //                   <View style={styles.modalGrid}>
  //                     <View style={styles.modalItem}>
  //                       <Text style={styles.modalLabel}>Max Profit</Text>
  //                       <Text style={[styles.modalValue, styles.profitText]}>${selectedOpp.maxProfit}</Text>
  //                     </View>
  //                     <View style={styles.modalItem}>
  //                       <Text style={styles.modalLabel}>Max Loss</Text>
  //                       <Text style={[styles.modalValue, styles.lossText]}>${selectedOpp.maxLoss}</Text>
  //                     </View>
  //                     <View style={styles.modalItem}>
  //                       <Text style={styles.modalLabel}>R/R</Text>
  //                       <Text style={styles.modalValue}>{selectedOpp.rewardRiskRatio}:1</Text>
  //                     </View>
  //                   </View>
  //                 </View>

  //                 {selectedOpp.reason ? (
  //                   <View style={styles.modalSection}>
  //                     <Text style={styles.modalSectionTitle}>Why</Text>
  //                     <Text style={styles.reasonModalText}>{selectedOpp.reason}</Text>
  //                   </View>
  //                 ) : null}

  //                 <View style={[styles.modalSection, { borderLeftColor: strategyColor }]}>
  //                   <Text style={styles.modalSectionTitle}>Quick Setup</Text>
  //                   <Text style={styles.reasonModalText}>{JSON.stringify(selectedOpp.setup, null, 2)}</Text>
  //                 </View>
  //               </ScrollView>
  //             ) : (
  //               <ScrollView style={{ padding: 16 }}>
  //                 <Text style={styles.modalSectionTitle}>Setup JSON</Text>
  //                 <Text style={styles.reasonModalText}>{JSON.stringify(selectedOpp.setup, null, 2)}</Text>
  //                 <Text style={[styles.reasonModalText, { marginTop: 12 }]}>{JSON.stringify(selectedOpp.greeks, null, 2)}</Text>
  //               </ScrollView>
  //             )}
  //           </View>

  //           <View style={styles.modalFooter}>
  //             <TouchableOpacity
  //               style={styles.modalButton}
  //               onPress={() => {
  //                 addPaperTradeFromOpportunity(selectedOpp);
  //                 setSelectedOpp(null);
  //               }}
  //             >
  //               <Text style={styles.modalButtonText}>📈 Add to Paper Portfolio</Text>
  //             </TouchableOpacity>

  //             <TouchableOpacity style={[styles.modalButton, styles.secondaryButton]} onPress={() => setSelectedOpp(null)}>
  //               <Text style={styles.secondaryButtonText}>Close</Text>
  //             </TouchableOpacity>
  //           </View>
  //         </View>
  //       </View>
  //     </Modal>
  //   );
  // };

  const renderTradeDetails = (opp) => {
    if (!opp || !opp.setup) return null;

    const tradeType = opp.type;
    const isCredit = tradeType.includes("credit") || tradeType === "theta-decay" || tradeType === "iron-condor";
    const isDebit = tradeType.includes("debit");
    const isStraddle = tradeType === "volatility";

    let tradeInstructions = [];
    let optionLegs = [];
    let maxProfit = opp.maxProfit;
    let maxLoss = opp.maxLoss;
    let breakevenPoints = [];
    let currentStockPrice = opp.currentPrice || 0;

    switch (opp.strategy) {
      case "Iron Condor":
      case "Iron Condor (Near Miss)":
        const { shortCall, longCall, shortPut, longPut } = opp.setup;
        const putDistance = ((currentStockPrice - shortPut) / currentStockPrice * 100).toFixed(1);
        const callDistance = ((shortCall - currentStockPrice) / currentStockPrice * 100).toFixed(1);

        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          "",
          "SELL Put Spread:",
          `  • SELL Put @ $${shortPut} strike (${putDistance}% OTM)`,
          `  • BUY Put @ $${longPut} strike (lower strike)`,
          "",
          "SELL Call Spread:",
          `  • SELL Call @ $${shortCall} strike (${callDistance}% OTM)`,
          `  • BUY Call @ $${longCall} strike (higher strike)`,
          "",
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Net Credit: $${opp.cost} per contract`,
        ];

        optionLegs = [
          { action: "SELL", type: "PUT", strike: shortPut, premium: "Credit", distance: `${putDistance}% OTM` },
          { action: "BUY", type: "PUT", strike: longPut, premium: "Debit", distance: "" },
          { action: "SELL", type: "CALL", strike: shortCall, premium: "Credit", distance: `${callDistance}% OTM` },
          { action: "BUY", type: "CALL", strike: longCall, premium: "Debit", distance: "" },
        ];

        const netCredit = parseFloat(opp.cost);
        breakevenPoints = [
          `Put side: $${shortPut} - $${netCredit.toFixed(2)} = $${(shortPut - netCredit).toFixed(2)} (${((shortPut - netCredit - currentStockPrice) / currentStockPrice * 100).toFixed(1)}% from current)`,
          `Call side: $${shortCall} + $${netCredit.toFixed(2)} = $${(shortCall + netCredit).toFixed(2)} (${((shortCall + netCredit - currentStockPrice) / currentStockPrice * 100).toFixed(1)}% from current)`,
        ];
        break;

      case "Bull Call Spread":
      case "Bear Put Spread":
        const isBull = opp.strategy.includes("Bull");
        const longStrike = isBull ? opp.setup.longCall : opp.setup.longPut;
        const shortStrike = isBull ? opp.setup.shortCall : opp.setup.shortPut;
        const optionType = isBull ? "CALL" : "PUT";

        const longDistance = isBull
          ? ((longStrike - currentStockPrice) / currentStockPrice * 100).toFixed(1)
          : ((currentStockPrice - longStrike) / currentStockPrice * 100).toFixed(1);
        const shortDistance = isBull
          ? ((shortStrike - currentStockPrice) / currentStockPrice * 100).toFixed(1)
          : ((currentStockPrice - shortStrike) / currentStockPrice * 100).toFixed(1);

        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          "",
          `${isBull ? "BULLISH" : "BEARISH"} VERTICAL SPREAD:`,
          `1. BUY ${optionType} @ $${longStrike} strike (${isBull ? longDistance + "% ITM" : longDistance + "% OTM"})`,
          `2. SELL ${optionType} @ $${shortStrike} strike (${isBull ? shortDistance + "% OTM" : shortDistance + "% ITM"})`,
          "",
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Net Debit: $${opp.cost} per contract`,
        ];

        optionLegs = [
          { action: "BUY", type: optionType, strike: longStrike, premium: "Debit", distance: `${longDistance}% ${isBull ? "ITM" : "OTM"}` },
          { action: "SELL", type: optionType, strike: shortStrike, premium: "Credit", distance: `${shortDistance}% ${isBull ? "OTM" : "ITM"}` },
        ];

        const debit = parseFloat(opp.cost);
        if (isBull) {
          const breakevenPrice = longStrike + debit;
          const breakevenDistance = ((breakevenPrice - currentStockPrice) / currentStockPrice * 100).toFixed(1);
          breakevenPoints = [
            `Breakeven: $${longStrike} + $${debit.toFixed(2)} = $${breakevenPrice.toFixed(2)} (${breakevenDistance}% from current)`,
            `Profit Zone: Stock between $${breakevenPrice.toFixed(2)} and $${shortStrike}`,
          ];
        } else {
          const breakevenPrice = longStrike - debit;
          const breakevenDistance = ((currentStockPrice - breakevenPrice) / currentStockPrice * 100).toFixed(1);
          breakevenPoints = [
            `Breakeven: $${longStrike} - $${debit.toFixed(2)} = $${breakevenPrice.toFixed(2)} (${breakevenDistance}% from current)`,
            `Profit Zone: Stock between $${shortStrike} and $${breakevenPrice.toFixed(2)}`,
          ];
        }
        break;

      case "Theta Call Sale":
      case "Theta Put Sale":
      case "Naked Put Sale":
        const isCall = opp.strategy.includes("Call");
        const strike = opp.setup.strike;

        const strikeDistance = isCall
          ? ((strike - currentStockPrice) / currentStockPrice * 100).toFixed(1)
          : ((currentStockPrice - strike) / currentStockPrice * 100).toFixed(1);

        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          "",
          "NAKED OPTION SALE:",
          `SELL ${isCall ? "CALL" : "PUT"} @ $${strike} strike (${strikeDistance}% OTM)`,
          "",
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Credit Received: $${opp.cost} per contract`,
          "",
          "⚠️ WARNING: Unlimited risk! Use stop losses.",
        ];

        optionLegs = [{ action: "SELL", type: isCall ? "CALL" : "PUT", strike: strike, premium: "Credit", distance: `${strikeDistance}% OTM` }];

        const credit = parseFloat(opp.cost);
        if (isCall) {
          const breakevenPrice = strike + credit;
          const breakevenDistance = ((breakevenPrice - currentStockPrice) / currentStockPrice * 100).toFixed(1);
          breakevenPoints = [`Breakeven: Stock at $${breakevenPrice.toFixed(2)} (${breakevenDistance}% from current)`];
          maxLoss = "Unlimited (stock above breakeven)";
        } else {
          const breakevenPrice = strike - credit;
          const breakevenDistance = ((currentStockPrice - breakevenPrice) / currentStockPrice * 100).toFixed(1);
          breakevenPoints = [`Breakeven: Stock at $${breakevenPrice.toFixed(2)} (${breakevenDistance}% from current)`];
          maxLoss = `$${strike} (if stock goes to $0)`;
        }
        break;

      case "Long Straddle":
        const { callStrike, putStrike } = opp.setup;

        // const callDistance = ((callStrike - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        // const putDistance = ((currentStockPrice - putStrike) / currentStockPrice * 100).toFixed(1);
        callDistance = ((callStrike - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        putDistance = ((currentStockPrice - putStrike) / currentStockPrice * 100).toFixed(1);

        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          "",
          "LONG STRADDLE:",
          `1. BUY CALL @ $${callStrike} strike (${Math.abs(callDistance)}% ${parseFloat(callDistance) > 0 ? "OTM" : "ITM"})`,
          `2. BUY PUT @ $${putStrike} strike (${Math.abs(putDistance)}% ${parseFloat(putDistance) > 0 ? "OTM" : "ITM"})`,
          "",
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Total Debit: $${opp.cost} per contract`,
          "",
          "✅ Profit if stock moves significantly in EITHER direction",
        ];

        optionLegs = [
          { action: "BUY", type: "CALL", strike: callStrike, premium: "Debit", distance: `${Math.abs(callDistance)}% ${parseFloat(callDistance) > 0 ? "OTM" : "ITM"}` },
          { action: "BUY", type: "PUT", strike: putStrike, premium: "Debit", distance: `${Math.abs(putDistance)}% ${parseFloat(putDistance) > 0 ? "OTM" : "ITM"}` },
        ];

        const totalDebit = parseFloat(opp.cost);
        const upperBreakeven = callStrike + totalDebit;
        const lowerBreakeven = putStrike - totalDebit;
        const upperDistance = ((upperBreakeven - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        const lowerDistance = ((currentStockPrice - lowerBreakeven) / currentStockPrice * 100).toFixed(1);

        breakevenPoints = [
          `Upper Breakeven: $${callStrike} + $${totalDebit.toFixed(2)} = $${upperBreakeven.toFixed(2)} (${upperDistance}% from current)`,
          `Lower Breakeven: $${putStrike} - $${totalDebit.toFixed(2)} = $${lowerBreakeven.toFixed(2)} (${lowerDistance}% from current)`,
        ];
        maxProfit = "Unlimited (in either direction)";
        break;

      case "Credit Spread":
        const { shortCall: creditShortCall, longCall: creditLongCall } = opp.setup;

        const shortCallDistance = ((creditShortCall - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        const longCallDistance = ((creditLongCall - currentStockPrice) / currentStockPrice * 100).toFixed(1);

        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          "",
          "BEAR CALL SPREAD:",
          `1. SELL CALL @ $${creditShortCall} strike (${shortCallDistance}% OTM)`,
          `2. BUY CALL @ $${creditLongCall} strike (${longCallDistance}% OTM)`,
          "",
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Net Credit: $${opp.cost} per contract`,
        ];

        optionLegs = [
          { action: "SELL", type: "CALL", strike: creditShortCall, premium: "Credit", distance: `${shortCallDistance}% OTM` },
          { action: "BUY", type: "CALL", strike: creditLongCall, premium: "Debit", distance: `${longCallDistance}% OTM` },
        ];

        const bearCredit = parseFloat(opp.cost);
        const bearBreakeven = creditShortCall + bearCredit;
        const bearDistance = ((bearBreakeven - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        breakevenPoints = [`Breakeven: Stock at $${bearBreakeven.toFixed(2)} (${bearDistance}% from current)`];
        break;
    }

    return (
      <ScrollView style={styles.tradeDetailsContainer}>
        <Text style={styles.tradeDetailsTitle}>📋 EXACT TRADE TO MAKE</Text>

        <View style={styles.currentPriceBanner}>
          <Text style={styles.currentPriceLabel}>Current {opp.symbol} Price:</Text>
          <Text style={styles.currentPriceValue}>${currentStockPrice.toFixed(2)}</Text>
        </View>

        <View style={styles.tradeSummary}>
          <View style={styles.tradeSummaryRow}>
            <Text style={styles.tradeSummaryLabel}>Strategy:</Text>
            <Text style={styles.tradeSummaryValue}>{opp.strategy}</Text>
          </View>
          <View style={styles.tradeSummaryRow}>
            <Text style={styles.tradeSummaryLabel}>Direction:</Text>
            <Text
              style={[
                styles.tradeSummaryValue,
                opp.greeks.delta > 0.3 ? styles.bullishText : opp.greeks.delta < -0.3 ? styles.bearishText : styles.neutralText,
              ]}
            >
              {opp.greeks.delta > 0.3 ? "BULLISH" : opp.greeks.delta < -0.3 ? "BEARISH" : "NEUTRAL"}
            </Text>
          </View>
          <View style={styles.tradeSummaryRow}>
            <Text style={styles.tradeSummaryLabel}>Expiration:</Text>
            <Text style={styles.tradeSummaryValue}>{opp.expiration}</Text>
          </View>
          <View style={styles.tradeSummaryRow}>
            <Text style={styles.tradeSummaryLabel}>DTE:</Text>
            <Text style={styles.tradeSummaryValue}>{opp.daysToExpiry} days</Text>
          </View>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>📊 Option Legs:</Text>
          {optionLegs.map((leg, index) => (
            <View key={index} style={styles.optionLeg}>
              <View style={[styles.legAction, leg.action === "BUY" ? styles.buyAction : styles.sellAction]}>
                <Text style={styles.legActionText}>{leg.action}</Text>
              </View>
              <View style={[styles.legType, leg.type === "CALL" ? styles.callType : styles.putType]}>
                <Text style={styles.legTypeText}>{leg.type}</Text>
              </View>
              <View style={styles.legStrikeContainer}>
                <Text style={styles.legStrike}>${leg.strike}</Text>
                {leg.distance ? <Text style={styles.legDistance}>{leg.distance}</Text> : null}
              </View>
              <Text style={[styles.legPremium, leg.premium === "Credit" ? styles.creditText : styles.debitText]}>
                {leg.premium}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>📝 Step-by-Step Instructions:</Text>
          {tradeInstructions.map((line, index) => (
            <Text key={index} style={styles.instructionLine}>
              {line}
            </Text>
          ))}
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>⚖️ Risk/Reward Analysis:</Text>

          <View style={styles.riskRewardGrid}>
            <View style={styles.riskRewardItem}>
              <Text style={styles.riskRewardLabel}>Max Profit</Text>
              <Text style={[styles.riskRewardValue, styles.profitValue]}>${maxProfit}</Text>
              <Text style={styles.riskRewardDesc}>
                {isCredit ? "Keep entire credit if expires OTM" : isDebit ? "Difference between strikes minus cost" : "Unlimited if stock moves enough"}
              </Text>
            </View>

            <View style={styles.riskRewardItem}>
              <Text style={styles.riskRewardLabel}>Max Loss</Text>
              <Text style={[styles.riskRewardValue, styles.lossValue]}>${maxLoss}</Text>
              <Text style={styles.riskRewardDesc}>
                {isCredit ? "Difference between strikes minus credit" : isDebit ? "Total debit paid" : opp.strategy.includes("Naked") ? "Unlimited (use stops!)" : "Difference between strikes"}
              </Text>
            </View>
          </View>

          <View style={styles.breakevenContainer}>
            <Text style={styles.breakevenTitle}>🎯 Breakeven Points:</Text>
            {breakevenPoints.map((point, index) => (
              <Text key={index} style={styles.breakevenText}>
                • {point}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>📈 Greeks Analysis:</Text>

          <View style={styles.greekImpact}>
            <Text style={styles.greekImpactLabel}>Δ Delta {opp.greeks.delta.toFixed(2)}:</Text>
            <Text style={styles.greekImpactText}>
              {Math.abs(opp.greeks.delta) > 0.4
                ? "Strong directional bias - trade expects price movement"
                : Math.abs(opp.greeks.delta) > 0.2
                ? "Moderate directional bias"
                : "Neutral - minimal price sensitivity"}
            </Text>
          </View>

          <View style={styles.greekImpact}>
            <Text style={styles.greekImpactLabel}>Θ Theta {opp.greeks.theta.toFixed(2)}:</Text>
            <Text style={styles.greekImpactText}>
              {opp.greeks.theta > 0 ? `✅ Earns $${Math.abs(opp.greeks.theta).toFixed(2)} per day from time decay` : `❌ Loses $${Math.abs(opp.greeks.theta).toFixed(2)} per day from time decay`}
            </Text>
          </View>

          <View style={styles.greekImpact}>
            <Text style={styles.greekImpactLabel}>ν Vega {opp.greeks.vega.toFixed(2)}:</Text>
            <Text style={styles.greekImpactText}>
              {opp.greeks.vega > 0 ? `✅ Profits if IV rises $${Math.abs(opp.greeks.vega).toFixed(2)} per 1% IV increase` : `❌ Loses if IV rises $${Math.abs(opp.greeks.vega).toFixed(2)} per 1% IV increase`}
            </Text>
          </View>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>🔄 Trade Management Rules:</Text>

          <View style={styles.managementRule}>
            <Text style={styles.ruleIcon}>🎯</Text>
            <View style={styles.ruleContent}>
              <Text style={styles.ruleTitle}>Profit Target:</Text>
              <Text style={styles.ruleText}>
                {isCredit ? "Take profit at 50-75% of max profit" : isDebit ? "Take profit at 75-100% of max profit" : "Take profit when IV expands or price moves significantly"}
              </Text>
            </View>
          </View>

          <View style={styles.managementRule}>
            <Text style={styles.ruleIcon}>🛑</Text>
            <View style={styles.ruleContent}>
              <Text style={styles.ruleTitle}>Stop Loss:</Text>
              <Text style={styles.ruleText}>
                {isCredit ? "Exit if loss reaches 150-200% of credit received" : isDebit ? "Exit if loss reaches 50% of debit paid" : "Exit if loss reaches 50% of premium paid"}
              </Text>
            </View>
          </View>

          <View style={styles.managementRule}>
            <Text style={styles.ruleIcon}>📅</Text>
            <View style={styles.ruleContent}>
              <Text style={styles.ruleTitle}>Time Management:</Text>
              <Text style={styles.ruleText}>
                {opp.daysToExpiry <= 3 ? "Close before expiration to avoid assignment risk" : opp.daysToExpiry <= 10 ? "Monitor daily - gamma risk increases" : "Weekly monitoring sufficient"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>💻 How to Enter in Your Broker:</Text>
          <Text style={styles.brokerText}>1. Go to options chain for {opp.symbol}</Text>
          <Text style={styles.brokerText}>2. Select expiration: {opp.expiration}</Text>
          <Text style={styles.brokerText}>3. Enter as a {optionLegs.length > 2 ? "4-leg" : "2-leg"} order</Text>
          <Text style={styles.brokerText}>4. Use LIMIT order, not market</Text>
          <Text style={styles.brokerText}>
            5. Set price: ${opp.cost} {isCredit ? "credit" : "debit"}
          </Text>
          <Text style={styles.brokerText}>6. Review and submit order</Text>
        </View>

        <View style={styles.disclaimerContainer}>
          <Text style={styles.disclaimerText}>
            ⚠️ This is not financial advice. Trade at your own risk. Always do your own research and consider paper trading first.
          </Text>
        </View>
      </ScrollView>
    );
  };

  // ✅ MODIFIED (no removals): this modal now adds to paper portfolio
  const renderOpportunityModal = () => {
    if (!selectedOpp) return null;

    const strategyColor = getStrategyColor(selectedOpp.type);

    return (
      <Modal animationType="slide" transparent={true} visible={!!selectedOpp} onRequestClose={() => setSelectedOpp(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {selectedOpp.symbol} - {selectedOpp.strategy}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {selectedOpp.probability}% Probability • Score: {selectedOpp.score}
                </Text>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedOpp(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalTabs}>
              <TouchableOpacity style={[styles.modalTab, modalTab === "details" && styles.activeModalTab]} onPress={() => setModalTab("details")}>
                <Text style={[styles.modalTabText, modalTab === "details" && styles.activeModalTabText]}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalTab, modalTab === "trade" && styles.activeModalTab]} onPress={() => setModalTab("trade")}>
                <Text style={[styles.modalTabText, modalTab === "trade" && styles.activeModalTabText]}>Trade Setup</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {modalTab === "details" ? (
                <ScrollView>
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Trade Details</Text>
                    <View style={styles.modalGrid}>
                      <View style={styles.modalItem}>
                        <Text style={styles.modalLabel}>Current Price</Text>
                        <Text style={styles.modalValue}>${selectedOpp.currentPrice?.toFixed(2) || "N/A"}</Text>
                      </View>
                      <View style={styles.modalItem}>
                        <Text style={styles.modalLabel}>Expiration</Text>
                        <Text style={styles.modalValue}>{selectedOpp.expiration}</Text>
                      </View>
                      <View style={styles.modalItem}>
                        <Text style={styles.modalLabel}>Days to Expiry</Text>
                        <Text style={styles.modalValue}>{selectedOpp.daysToExpiry}</Text>
                      </View>
                      <View style={styles.modalItem}>
                        <Text style={styles.modalLabel}>IV Percentile</Text>
                        <Text style={styles.modalValue}>{selectedOpp.ivPercentile}%</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Risk Analysis</Text>
                    <View style={styles.modalGrid}>
                      <View style={styles.modalItem}>
                        <Text style={styles.modalLabel}>Max Profit</Text>
                        <Text style={[styles.modalValue, styles.profitText]}>${selectedOpp.maxProfit}</Text>
                      </View>
                      <View style={styles.modalItem}>
                        <Text style={styles.modalLabel}>Max Loss</Text>
                        <Text style={[styles.modalValue, styles.lossText]}>${selectedOpp.maxLoss}</Text>
                      </View>
                      <View style={styles.modalItem}>
                        <Text style={styles.modalLabel}>Risk/Reward</Text>
                        <Text style={styles.modalValue}>{selectedOpp.rewardRiskRatio}:1</Text>
                      </View>
                    </View>
                  </View>

                  {selectedOpp.reason && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Why This Trade?</Text>
                      <Text style={styles.reasonModalText}>{selectedOpp.reason}</Text>
                    </View>
                  )}
                </ScrollView>
              ) : (
                renderTradeDetails(selectedOpp)
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  addPaperTradeFromOpportunity(selectedOpp);
                  setSelectedOpp(null);
                }}
              >
                <Text style={styles.modalButtonText}>📈 Add to Paper Portfolio</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalButton, styles.secondaryButton]} onPress={() => setSelectedOpp(null)}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };
  const renderUnusualModal = () => {
    if (!selectedUnusual) return null;
    const u = selectedUnusual;
    const mid = (Number(u.bid || 0) + Number(u.ask || 0)) > 0 ? ((Number(u.bid || 0) + Number(u.ask || 0)) / 2).toFixed(2) : "—";

    return (
      <Modal animationType="slide" transparent visible onRequestClose={() => setSelectedUnusual(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalTitle}>{u.underlying} • Unusual Contract</Text>
                <Text style={styles.modalSubtitle}>{u.symbol}</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSelectedUnusual(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 16 }}>
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Contract</Text>
                <Text style={styles.modalTextLine}>Type: {String(u.optionType || "").toUpperCase()}</Text>
                <Text style={styles.modalTextLine}>Strike: {u.strike}</Text>
                <Text style={styles.modalTextLine}>Expiration: {u.expiration}</Text>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Flow</Text>
                <Text style={styles.modalTextLine}>Volume: {u.volume}</Text>
                <Text style={styles.modalTextLine}>Open Interest: {u.openInterest}</Text>
                <Text style={styles.modalTextLine}>Vol/OI: {u.voi?.toFixed(2)}</Text>
                <Text style={styles.modalTextLine}>Score: {u.score?.toFixed(1)}</Text>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Pricing</Text>
                <Text style={styles.modalTextLine}>Bid: {u.bid ?? "—"}</Text>
                <Text style={styles.modalTextLine}>Ask: {u.ask ?? "—"}</Text>
                <Text style={styles.modalTextLine}>Mid: {mid}</Text>
                <Text style={styles.modalTextLine}>Last: {u.last ?? "—"}</Text>
              </View>

              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Why flagged</Text>
                <Text style={styles.reasonModalText}>{u.reason}</Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  addPaperTradeFromUnusual(u);
                  setSelectedUnusual(null);
                }}
              >
                <Text style={styles.modalButtonText}>📈 Add to Paper Portfolio</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.modalButton, styles.secondaryButton]} onPress={() => setSelectedUnusual(null)}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  const renderScanningOverlay = () => {
    if (!scanning) return null;
    return (
      <Modal animationType="fade" transparent visible>
        <View style={styles.scanOverlay}>
          <View style={styles.scanModal}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.scanTitle}>Scanning Opportunities</Text>
            <Text style={styles.scanStatus}>{scanStatus}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${scanProgress}%` }]} />
            </View>
            <Text style={styles.scanProgress}>{Math.round(scanProgress)}%</Text>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                // stop the scan loop immediately
                setScanning(false);
                cancelScanRef.current = true;
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel Scan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderSettingsModal = () => (
    <Modal animationType="slide" transparent visible={settingsOpen} onRequestClose={() => setSettingsOpen(false)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: "92%" }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Settings</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSettingsOpen(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16 }}>
            <Text style={styles.settingsSection}>Alpaca (Market Data)</Text>
            <Text style={styles.settingsHint}>Uses Data API for screeners + snapshots.</Text>
            <TextInput style={styles.input} placeholder="Alpaca Key ID" value={alpacaKeyId} onChangeText={setAlpacaKeyId} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Alpaca Secret Key" value={alpacaSecret} onChangeText={setAlpacaSecret} autoCapitalize="none" secureTextEntry />
            <TextInput style={styles.input} placeholder="Alpaca Data Base URL" value={alpacaBase} onChangeText={setAlpacaBase} autoCapitalize="none" />

            <View style={styles.hr} />

            <Text style={styles.settingsSection}>Finnhub (Company Name + Sector label ONLY)</Text>
            <Text style={styles.settingsHint}>Used only for Company + Sector (label). Options stay on Tradier/backend.</Text>
            <TextInput style={styles.input} placeholder="Finnhub API Token" value={finnhubToken} onChangeText={setFinnhubToken} autoCapitalize="none" secureTextEntry />
            <TextInput style={styles.input} placeholder="Finnhub Base URL" value={finnhubBase} onChangeText={setFinnhubBase} autoCapitalize="none" />

            <View style={styles.hr} />

            <Text style={styles.settingsSection}>Tradier (Unusual Options + Portfolio Quotes)</Text>
            <Text style={styles.settingsHint}>Unusual uses chains. Portfolio quotes fetch ONLY when you press “Get Current Prices”.</Text>
            <TextInput style={styles.input} placeholder="Tradier Bearer Token" value={tradierToken} onChangeText={setTradierToken} autoCapitalize="none" secureTextEntry />
            <TextInput style={styles.input} placeholder="Tradier Base URL" value={tradierBase} onChangeText={setTradierBase} autoCapitalize="none" />

            <View style={styles.hr} />

            <Text style={styles.settingsSection}>Universe Controls</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Alpaca top (max 100)</Text>
                <TextInput style={styles.input} value={String(universeTop)} onChangeText={(t) => setUniverseTop(Number(t || 0))} keyboardType="numeric" />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Max symbols to scan</Text>
                <TextInput style={styles.input} value={String(maxSymbolsToScan)} onChangeText={(t) => setMaxSymbolsToScan(Number(t || 0))} keyboardType="numeric" />
              </View>
            </View>

            <Text style={[styles.settingsSection, { marginTop: 12 }]}>Unusual Controls</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Symbols checked</Text>
                <TextInput
                  style={styles.input}
                  value={String(unusualSymbolsLimit)}
                  onChangeText={(t) => setUnusualSymbolsLimit(Number(t || 0))}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Max contracts/symbol</Text>
                <TextInput
                  style={styles.input}
                  value={String(unusualPerSymbolMax)}
                  onChangeText={(t) => setUnusualPerSymbolMax(Number(t || 0))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.hr} />
            <Text style={styles.settingsSection}>Include Sources</Text>
            {Object.entries(includeSources).map(([k, v]) => (
              <TouchableOpacity key={k} style={[styles.toggleRow, v ? styles.toggleOn : styles.toggleOff]} onPress={() => setIncludeSources((prev) => ({ ...prev, [k]: !prev[k] }))}>
                <Text style={styles.toggleText}>
                  {v ? "✅" : "⬜"} {k}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={{ height: 12 }} />

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={async () => {
                await saveSettings();
                setSettingsOpen(false);
                Alert.alert("Saved", "Settings saved.");
              }}
            >
              <Text style={styles.primaryButtonText}>Save</Text>
            </TouchableOpacity>

            <Text style={styles.smallNote}>Tip: Keep API keys out of source control. Prefer env/secrets injection.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // ---------------------------
  // Tabs UI
  // ---------------------------
  const renderUniverseTab = () => {
    const rows = getUniverseViewRows().slice(0, 100);
    const viewButtons = [
      ["merged", "Merged"],
      ["mostActiveVolume", "Most Active (Vol)"],
      ["topTraded", "Most Active (Trades)"],
      ["gainers", "Movers (Gainers)"],
      ["losers", "Movers (Losers)"],
      ["gapUps", "Gap Ups"],
      ["gapDowns", "Gap Downs"],
      ["trending", "Trending"],
    ];

    return (
      <ScrollView style={{ flex: 1 }}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Universe</Text>
          <Text style={styles.panelSub}>Pulled from Alpaca. Company/Sector labels from Finnhub (profile2).</Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <TouchableOpacity style={styles.primaryButton} onPress={loadUniverseFromAlpaca} disabled={universeLoading}>
              {universeLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Load Universe from Alpaca</Text>}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: "#111827", flex: 0.9 }]}
              onPress={() => loadCompanyMetaForSymbols((universeMeta.merged || []).slice(0, 200))}
              disabled={companyMetaLoading}
            >
              {companyMetaLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Refresh Names/Sectors</Text>}
            </TouchableOpacity>
          </View>

          {universeError ? <Text style={styles.errorText}>{universeError}</Text> : null}
          {companyMetaError ? <Text style={styles.errorText}>{companyMetaError}</Text> : null}

          <View style={styles.metaGrid}>
            {[
              ["mostActiveVolume", universeMeta.mostActiveVolume.length],
              ["topTraded", universeMeta.topTraded.length],
              ["gainers", universeMeta.gainers.length],
              ["losers", universeMeta.losers.length],
              ["gapUps", universeMeta.gapUps.length],
              ["gapDowns", universeMeta.gapDowns.length],
              ["trending", universeMeta.trending.length],
              ["merged", universeMeta.merged.length],
            ].map(([k, n]) => (
              <View key={k} style={styles.metaCell}>
                <Text style={styles.metaKey}>{k}</Text>
                <Text style={styles.metaVal}>{n}</Text>
              </View>
            ))}
          </View>

          {renderSectorDistribution()}

          <Text style={[styles.panelTitle, { marginTop: 12, fontSize: 15 }]}>Views</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {viewButtons.map(([id, label]) => (
                <TouchableOpacity
                  key={id}
                  onPress={() => setUniverseView(id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: universeView === id ? "#111827" : "rgba(17,24,39,0.08)",
                  }}
                >
                  <Text style={{ color: universeView === id ? "white" : "#111827", fontWeight: "900", fontSize: 12 }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={[styles.panelTitle, { marginTop: 12, fontSize: 16 }]}>
            {viewButtons.find((x) => x[0] === universeView)?.[1] || "Merged"} ({rows.length})
          </Text>

          <View style={styles.universeTableHeader}>
            <Text style={[styles.universeCell, styles.universeCellSym, { color: "white" }]}>Symbol</Text>
            <Text style={[styles.universeCell, { flex: 2.1, color: "white" }]}>Company</Text>
            <Text style={[styles.universeCell, { flex: 1.4, color: "white" }]}>Sector</Text>
            <Text style={[styles.universeCell, styles.universeCellNum, { color: "white" }]}>Price</Text>
            <Text style={[styles.universeCell, styles.universeCellNum, { color: "white" }]}>Chg%</Text>
            <Text style={[styles.universeCell, styles.universeCellNum, { color: "white" }]}>
              {universeView === "mostActiveVolume"
                ? "Vol"
                : universeView === "topTraded"
                ? "Trades"
                : universeView === "gapUps" || universeView === "gapDowns"
                ? "Gap%"
                : universeView === "trending"
                ? "Score"
                : "Vol"}
            </Text>
          </View>

          {rows.map((r) => {
            const sym = r.symbol;
            const { name, sector } = getCompanyLabel(sym);
            const priceText = r.price == null ? "—" : Number(r.price).toFixed(2);
            const chgText = r.changePct == null ? "—" : `${Number(r.changePct).toFixed(2)}%`;
            const chgStyle = r.changePct == null ? null : Number(r.changePct) >= 0 ? styles.pos : styles.neg;

            const lastCol =
              universeView === "mostActiveVolume"
                ? r.volume == null
                  ? "—"
                  : String(Math.round(r.volume))
                : universeView === "topTraded"
                ? r.trades == null
                  ? "—"
                  : String(Math.round(r.trades))
                : universeView === "gapUps" || universeView === "gapDowns"
                ? r.gapPct == null
                  ? "—"
                  : `${Number(r.gapPct).toFixed(2)}%`
                : universeView === "trending"
                ? r.trendScore == null
                  ? "—"
                  : String(Number(r.trendScore).toFixed(1))
                : r.volume == null
                ? "—"
                : String(Math.round(r.volume));

            return (
              <TouchableOpacity key={`${universeView}-${sym}`} style={styles.universeRow} onPress={() => openThinkorswimSmart(sym)} activeOpacity={0.85}>  
                <Text style={[styles.universeCell, styles.universeCellSym, styles.universeLink]}>{sym}</Text>
                <Text style={[styles.universeCell, { flex: 2.1 }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.universeCell, { flex: 1.4 }]} numberOfLines={1}>
                  {sector}
                </Text>
                <Text style={[styles.universeCell, styles.universeCellNum]}>{priceText}</Text>
                <Text style={[styles.universeCell, styles.universeCellNum, chgStyle]}>{chgText}</Text>
                <Text style={[styles.universeCell, styles.universeCellNum]}>{lastCol}</Text>
              </TouchableOpacity>
            );
          })}

          <Text style={styles.smallNote}>Tip: Tap a row to open Yahoo Finance.</Text>
        </View>
      </ScrollView>
    );
  };

  const renderUnusualTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Unusual Options Activity</Text>
        <Text style={styles.panelSub}>Computed from Tradier option chains using volume/open-interest spikes (heuristic).</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={loadUnusualOptions} disabled={unusualLoading}>
          {unusualLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Load Unusual Activity</Text>}
        </TouchableOpacity>

        {unusualError ? <Text style={styles.errorText}>{unusualError}</Text> : null}
        <Text style={[styles.panelSub, { marginTop: 8 }]}>
          Showing top {unusualList.length} contracts (from first {Math.min(unusualSymbolsLimit, symbolsToScan.length)} symbols).
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
        {unusualList.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🕵️</Text>
            <Text style={styles.emptyStateTitle}>No unusual contracts yet</Text>
            <Text style={styles.emptyStateText}>Load Universe, then “Load Unusual Activity”.</Text>
          </View>
        ) : (
          unusualList.map((u, idx) => (
            <TouchableOpacity key={`${u.symbol}-${idx}`} style={styles.unusualCard} activeOpacity={0.85} onPress={() => setSelectedUnusual(u)}>
              <View style={styles.unusualHeader}>
                <Text style={styles.unusualUnderlying}>{u.underlying}</Text>
                <Text style={styles.unusualScore}>Score {u.score.toFixed(1)}</Text>
              </View>
              <Text style={styles.unusualSymbol}>{u.symbol}</Text>
              <View style={styles.unusualRow}>
                <Text style={styles.unusualPill}>{String(u.optionType || "").toUpperCase()}</Text>
                <Text style={styles.unusualRowText}>Strike {u.strike}</Text>
                <Text style={styles.unusualRowText}>Exp {u.expiration}</Text>
              </View>
              <View style={styles.unusualRow}>
                <Text style={styles.unusualRowText}>Vol {u.volume}</Text>
                <Text style={styles.unusualRowText}>OI {u.openInterest}</Text>
                <Text style={styles.unusualRowText}>Vol/OI {u.voi?.toFixed(2)}</Text>
              </View>
              <Text style={styles.unusualReason}>{u.reason}</Text>
              <Text style={styles.tapHint}>Tap for details</Text>

              <TouchableOpacity
                style={[styles.inlineAddBtn]}
                onPress={() => {
                  addPaperTradeFromUnusual(u);
                }}
              >
                <Text style={styles.inlineAddBtnText}>+ Add to Paper Portfolio</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderOppsTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>🎯 Smart Options Opportunities</Text>
        <Text style={styles.subtitle}>Universe from Alpaca • Options scan uses your backend: {backendUrl}</Text>
      </View>

      <View style={styles.topButtonsRow}>
        <TouchableOpacity style={styles.smallButton} onPress={() => setSettingsOpen(true)}>
          <Text style={styles.smallButtonText}>⚙️ Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.smallButton} onPress={loadUniverseFromAlpaca} disabled={universeLoading}>
          <Text style={styles.smallButtonText}>{universeLoading ? "Loading..." : "🌐 Load Universe"}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.scanButton} onPress={scanOpportunities} disabled={loading || !symbolsToScan.length}>
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Text style={styles.scanButtonText}>🔍 Scan for Opportunities</Text>
            <Text style={styles.scanButtonSubtext}>
              Analyzes {symbolsToScan.length || 0} symbols (from Alpaca). {!symbolsToScan.length ? "Load Universe first." : ""}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {partialResults ? (
        <View style={styles.partialBanner}>
          <Text style={styles.partialBannerText}>
            ⚠️ Scan stopped ({scanStoppedReason || "unknown"}). Showing results from {scanCompletedSymbols} symbols.
          </Text>
          <TouchableOpacity style={styles.partialBannerBtn} onPress={() => scanOpportunities()} disabled={loading}>
            <Text style={styles.partialBannerBtnText}>{loading ? "..." : "Retry"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {renderProbabilityTabs()}

      <View style={styles.opportunitiesSection}>
        {getCurrentOpportunities().length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📊</Text>
            <Text style={styles.emptyStateTitle}>No opportunities yet</Text>
            <Text style={styles.emptyStateText}>Load Universe, then Scan.</Text>
          </View>
        ) : (
          <ScrollView style={styles.opportunitiesList}>{getCurrentOpportunities().map(renderOpportunityCard)}</ScrollView>
        )}
      </View>
    </View>
  );

  const portfolioTotals = useMemo(() => {
    let pnl = 0;
    let countWithPnl = 0;
    paperPortfolio.forEach((t) => {
      if (toNum(t.pnl) != null) {
        pnl += Number(t.pnl);
        countWithPnl++;
      }
    });
    return { pnl, countWithPnl };
  }, [paperPortfolio]);

  const renderPortfolioTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>📒 Paper Portfolio</Text>
        <Text style={styles.subtitle}>
          P&L updates only when you press "Get Current Prices" (Tradier quotes).{" "}
          {portfolioLastUpdated ? `Last: ${new Date(portfolioLastUpdated).toLocaleString()}` : ""}
        </Text>
      </View>

      <View style={styles.topButtonsRow}>
        <TouchableOpacity style={styles.smallButton} onPress={() => setSettingsOpen(true)}>
          <Text style={styles.smallButtonText}>⚙️ Settings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.smallButton, { backgroundColor: "#111827" }]} onPress={updatePortfolioPrices} disabled={portfolioLoadingPrices}>
          <Text style={styles.smallButtonText}>{portfolioLoadingPrices ? "..." : "💸 Get Current Prices"}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.smallButton, { backgroundColor: "#7c2d12" }]}
          onPress={() => {
            Alert.alert("Clear portfolio?", "This removes all paper trades.", [
              { text: "Cancel", style: "cancel" },
              { text: "Clear", style: "destructive", onPress: () => setPaperPortfolio([]) },
            ]);
          }}
        >
          <Text style={styles.smallButtonText}>🗑️ Clear</Text>
        </TouchableOpacity>
      </View>

      {portfolioError ? <Text style={[styles.errorText, { marginHorizontal: 12 }]}>{portfolioError}</Text> : null}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Summary</Text>
        <Text style={styles.panelSub}>
          Trades: {paperPortfolio.length} • With P&L: {portfolioTotals.countWithPnl} • Total P&L:{" "}
          <Text style={{ color: portfolioTotals.pnl >= 0 ? "#10B981" : "#EF4444", fontWeight: "900" }}>
            {portfolioTotals.countWithPnl ? `$${portfolioTotals.pnl.toFixed(2)}` : "—"}
          </Text>
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 12 }}>
        {paperPortfolio.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>🧾</Text>
            <Text style={styles.emptyStateTitle}>No paper trades yet</Text>
            <Text style={styles.emptyStateText}>Add from an Opportunity or from an Unusual Options contract.</Text>
          </View>
        ) : (
          paperPortfolio.map((t) => {
            const dte = yyyyMmDdToDte(t.expiration);
            const cur = toNum(t.currentValue);
            const entry = toNum(t.entryValue);
            const pnl = toNum(t.pnl);
            const pnlPct = toNum(t.pnlPct);

            return (
              <View key={t.id} style={styles.portCard}>
                <View style={styles.portHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.portTitle}>
                      {t.underlying} • {t.strategy}
                    </Text>
                    <Text style={styles.portSub}>
                      Exp {t.expiration} • DTE {dte ?? "—"} • Qty {t.qty} • Source: {t.source}
                    </Text>
                  </View>

                  <TouchableOpacity onPress={() => openShareForTrade(t)} style={styles.portShareBtn}>
                    <Text style={styles.portShareText}>📣</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => removePaperTrade(t.id)} style={styles.portRemoveBtn}>
                    <Text style={styles.portRemoveText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.portDetailsRow}>
                  <View style={styles.portDetailCol}>
                    <Text style={styles.portDetailLabel}>Entry</Text>
                    <Text style={styles.portDetailValue}>{t.entryLabel || `$${fmt2(entry)}`}</Text>
                  </View>
                  <View style={styles.portDetailCol}>
                    <Text style={styles.portDetailLabel}>Current</Text>
                    <Text style={styles.portDetailValue}>{cur != null ? `$${fmt2(cur)}` : "—"}</Text>
                  </View>
                  <View style={styles.portDetailCol}>
                    <Text style={styles.portDetailLabel}>P&L</Text>
                    <Text style={[styles.portDetailValue, { color: (pnl || 0) >= 0 ? "#10B981" : "#EF4444" }]}>{pnl != null ? `$${fmt2(pnl)}` : "—"}</Text>
                  </View>
                  <View style={styles.portDetailCol}>
                    <Text style={styles.portDetailLabel}>%</Text>
                    <Text style={[styles.portDetailValue, { color: (pnlPct || 0) >= 0 ? "#10B981" : "#EF4444" }]}>
                      {pnlPct != null ? `${fmt2(pnlPct)}%` : "—"}
                    </Text>
                  </View>
                </View>

                <View style={styles.portLegs}>
                  <Text style={styles.portLegsTitle}>Legs:</Text>
                  {(t.legs || []).map((leg, idx) => (
                    <View key={idx} style={styles.portLeg}>
                      <Text style={styles.portLegText}>
                        {leg.action} {leg.optionType?.toUpperCase()} ${leg.strike}
                      </Text>
                      <Text style={styles.portLegSub}>
                        {leg.symbol ? leg.symbol : "No symbol"}
                        {leg.lastMid != null ? ` • Mid: $${fmt2(leg.lastMid)}` : ""}
                      </Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  onPress={() => {
                    // Alert.prompt iOS only; fallback for Android: simple modal-ish input via Alert.alert not possible.
                    if (Platform.OS !== "ios") {
                      Alert.alert("Notes", "On Android, edit notes by temporarily switching to iOS, or wire a dedicated notes modal.");
                      return;
                    }
                    Alert.prompt(
                      "Edit Notes",
                      "Add notes about this trade:",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Save", onPress: (text) => updatePaperTradeNotes(t.id, { userNotes: text || "" }) },
                      ],
                      "plain-text",
                      t.userNotes || ""
                    );
                  }}
                  style={styles.portNotes}
                >
                  <Text style={styles.portNotesLabel}>📝 Notes: {t.userNotes || "Tap to add notes"}</Text>
                </TouchableOpacity>

                {t.whySpotted ? <Text style={styles.portWhy}>💡 {t.whySpotted.substring(0, 110)}...</Text> : null}

                <Text style={styles.portMeta}>
                  Added {new Date(t.createdAt).toLocaleDateString()} • Last updated {new Date(t.updatedAt).toLocaleDateString()}
                </Text>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  // const MainTabs = () => (
  //   <View style={styles.mainTabs}>
  //     {[
  //       ["opps", "Opportunities"],
  //       ["unusual", "Unusual Options"],
  //       ["universe", "Universe"],
  //       ["portfolio", "Portfolio"],
  //     ].map(([id, label]) => (
  //       <TouchableOpacity key={id} style={[styles.mainTab, activeMainTab === id && styles.mainTabActive]} onPress={() => setActiveMainTab(id)}>
  //         <Text style={[styles.mainTabText, activeMainTab === id && styles.mainTabTextActive]}>{label}</Text>
  //       </TouchableOpacity>
  //     ))}

  //     <TouchableOpacity style={styles.mainTabRight} onPress={() => setSettingsOpen(true)}>
  //       <Text style={styles.mainTabText}>
  const MainTabs = () => (
    <View style={styles.mainTabs}>
      {[
        ["opps", "Opportunities"],
        ["unusual", "Unusual Options"],
        ["universe", "Universe"],
        ["portfolio", "Portfolio"],
      ].map(([id, label]) => (
        <TouchableOpacity key={id} style={[styles.mainTab, activeMainTab === id && styles.mainTabActive]} onPress={() => setActiveMainTab(id)}>
          <Text style={[styles.mainTabText, activeMainTab === id && styles.mainTabTextActive]}>{label}</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.mainTabRight} onPress={() => setSettingsOpen(true)}>
        <Text style={styles.mainTabText}>⚙️</Text>
      </TouchableOpacity>
    </View>
  );
  // ---------------------------
  // Main Render
  // ---------------------------
  return (
    <View style={styles.container}>
      <MainTabs />

      {activeMainTab === "opps" && renderOppsTab()}
      {activeMainTab === "unusual" && renderUnusualTab()}
      {activeMainTab === "universe" && renderUniverseTab()}
      {activeMainTab === "portfolio" && renderPortfolioTab()}

      {/* Modals */}
      {renderSettingsModal()}
      {renderOpportunityModal()}
      {renderUnusualModal()}
      {renderShareModal()}
      {renderScanningOverlay()}

      {/* Bottom status bar */}
      <View style={styles.bottomStatus}>
        <Text style={styles.bottomStatusText}>
          {(() => {
            if (activeMainTab === "opps") {
              return `Loaded ${universeMeta.merged?.length || 0} symbols • Ready to scan`;
            } else if (activeMainTab === "universe") {
              return `Company labels: ${sectorStats.known}/${sectorStats.total}`;
            } else if (activeMainTab === "portfolio") {
              return `Paper trades: ${paperPortfolio.length} • P&L: $${portfolioTotals.pnl.toFixed(2)}`;
            }
            return "Smart Opportunities v1.0";
          })()}
        </Text>
      </View>
    </View>
  );
};

// ---------------------------
// Styles
// ---------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    padding: 16,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  topButtonsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "white",
    gap: 8,
  },
  smallButton: {
    flex: 1,
    backgroundColor: "#3B82F6",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  smallButtonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 13,
  },
  scanButton: {
    margin: 16,
    backgroundColor: "#10B981",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  scanButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "900",
  },
  scanButtonSubtext: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 11,
    marginTop: 4,
  },
  panel: {
    margin: 12,
    padding: 16,
    backgroundColor: "white",
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  panelSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 12,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
    gap: 6,
  },
  metaCell: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: "22%",
    alignItems: "center",
  },
  metaKey: {
    fontSize: 9,
    color: "#6B7280",
    textTransform: "uppercase",
    fontWeight: "700",
  },
  metaVal: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
    marginTop: 2,
  },
  sectorCard: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sectorTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  sectorSub: {
    fontSize: 10,
    color: "#64748B",
  },
  sectorBar: {
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    marginTop: 8,
    flexDirection: "row",
    overflow: "hidden",
  },
  sectorSlice: {
    height: "100%",
    backgroundColor: "#3B82F6",
  },
  sectorLegendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226,232,240,0.5)",
  },
  sectorLegendText: {
    fontSize: 11,
    color: "#334155",
    flex: 1,
  },
  sectorLegendPct: {
    fontSize: 11,
    color: "#64748B",
    fontWeight: "700",
    marginLeft: 8,
  },
  sectorHint: {
    fontSize: 10,
    color: "#94A3B8",
    fontStyle: "italic",
    marginTop: 8,
  },
  universeTableHeader: {
    flexDirection: "row",
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    marginTop: 12,
  },
  universeRow: {
    flexDirection: "row",
    backgroundColor: "white",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  universeCell: {
    fontSize: 12,
    color: "#374151",
    paddingHorizontal: 4,
  },
  universeCellSym: {
    flex: 0.8,
    fontWeight: "900",
  },
  universeCellNum: {
    flex: 0.8,
    textAlign: "right",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  universeLink: {
    color: "#3B82F6",
    textDecorationLine: "underline",
  },
  pos: {
    color: "#10B981",
    fontWeight: "700",
  },
  neg: {
    color: "#EF4444",
    fontWeight: "700",
  },
  tabsContainer: {
    backgroundColor: "white",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tabsInner: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 4,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 3,
    borderBottomColor: "transparent",
  },
  activeTab: {
    borderBottomColor: "#3B82F6",
  },
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
  },
  activeTabLabel: {
    color: "#111827",
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    minWidth: 24,
    alignItems: "center",
  },
  countText: {
    fontSize: 11,
    fontWeight: "900",
  },
  opportunitiesSection: {
    flex: 1,
    padding: 12,
  },
  opportunitiesList: {
    flex: 1,
  },
  opportunityCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  opportunityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  symbolContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  symbolText: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  strategyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  strategyText: {
    fontSize: 11,
    fontWeight: "900",
  },
  scoreContainer: {
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: 10,
    color: "#6B7280",
    marginBottom: 4,
  },
  scoreCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#111827",
    justifyContent: "center",
    alignItems: "center",
  },
  scoreText: {
    color: "white",
    fontSize: 14,
    fontWeight: "900",
  },
  nearMissBadge: {
    backgroundColor: "#FEF3C7",
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  nearMissText: {
    fontSize: 11,
    color: "#92400E",
    fontWeight: "600",
  },
  opportunityDetails: {},
  detailRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  probabilityBar: {
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 3,
    marginBottom: 6,
    overflow: "hidden",
  },
  probabilityFill: {
    height: "100%",
    borderRadius: 3,
  },
  profitText: {
    color: "#10B981",
  },
  lossText: {
    color: "#EF4444",
  },
  reasonText: {
    fontSize: 12,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "white",
    borderRadius: 16,
    width: "100%",
    maxHeight: "80%",
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  modalSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  modalClose: {
    fontSize: 18,
    color: "#6B7280",
    fontWeight: "900",
  },
  modalTabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  activeModalTab: {
    borderBottomWidth: 3,
    borderBottomColor: "#3B82F6",
  },
  modalTabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#6B7280",
  },
  activeModalTabText: {
    color: "#3B82F6",
  },
  modalBody: {
    flex: 1,
  },
  modalSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  modalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  modalItem: {
    width: "48%",
    marginBottom: 8,
  },
  modalLabel: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 4,
  },
  modalValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  modalTextLine: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 6,
  },
  reasonModalText: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  modalButton: {
    backgroundColor: "#10B981",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 8,
  },
  modalButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryButton: {
    backgroundColor: "#F3F4F6",
  },
  secondaryButtonText: {
    color: "#6B7280",
    fontSize: 15,
    fontWeight: "900",
  },
  scanOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  scanModal: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 32,
    width: "80%",
    alignItems: "center",
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
    marginTop: 20,
    marginBottom: 8,
  },
  scanStatus: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    width: "100%",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#10B981",
    borderRadius: 4,
  },
  scanProgress: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 20,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#EF4444",
    borderRadius: 8,
  },
  cancelButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  settingsSection: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  settingsHint: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    color: "#111827",
  },
  hr: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },
  row: {
    flexDirection: "row",
  },
  settingsLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  toggleRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  toggleOn: {
    backgroundColor: "#D1FAE5",
  },
  toggleOff: {
    backgroundColor: "#F3F4F6",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "600",
  },
  primaryButton: {
    backgroundColor: "#3B82F6",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "900",
  },
  smallNote: {
    fontSize: 10,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 8,
    fontWeight: "600",
  },
  partialBanner: {
    marginHorizontal: 16,
    padding: 12,
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F59E0B",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  partialBannerText: {
    color: "#92400E",
    fontSize: 11,
    flex: 1,
    marginRight: 8,
  },
  partialBannerBtn: {
    backgroundColor: "#92400E",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  partialBannerBtnText: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
  },
  unusualCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  unusualHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  unusualUnderlying: {
    fontSize: 18,
    fontWeight: "900",
    color: "#111827",
  },
  unusualScore: {
    fontSize: 12,
    color: "#8B5CF6",
    fontWeight: "900",
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  unusualSymbol: {
    fontSize: 11,
    color: "#6B7280",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 8,
  },
  unusualRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  unusualPill: {
    backgroundColor: "#111827",
    color: "white",
    fontSize: 10,
    fontWeight: "900",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  unusualRowText: {
    fontSize: 12,
    color: "#4B5563",
  },
  unusualReason: {
    fontSize: 11,
    color: "#6B7280",
    fontStyle: "italic",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  tapHint: {
    fontSize: 10,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 8,
  },
  inlineAddBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  inlineAddBtnText: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  mainTabs: {
    flexDirection: "row",
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  mainTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
  },
  mainTabActive: {
    borderBottomWidth: 3,
    borderBottomColor: "#3B82F6",
  },
  mainTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  mainTabTextActive: {
    color: "#3B82F6",
  },
  mainTabRight: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  portCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  portHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  portTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  portSub: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 4,
  },
  portShareBtn: {
    marginLeft: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  portShareText: {
    fontSize: 16,
  },
  portRemoveBtn: {
    marginLeft: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FEE2E2",
    justifyContent: "center",
    alignItems: "center",
  },
  portRemoveText: {
    fontSize: 16,
    color: "#EF4444",
    fontWeight: "900",
  },
  portDetailsRow: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 12,
  },
  portDetailCol: {
    flex: 1,
  },
  portDetailLabel: {
    fontSize: 10,
    color: "#6B7280",
    marginBottom: 4,
  },
  portDetailValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#111827",
  },
  portLegs: {
    marginBottom: 12,
  },
  portLegsTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  portLeg: {
    marginBottom: 6,
  },
  portLegText: {
    fontSize: 11,
    color: "#374151",
    fontWeight: "600",
  },
  portLegSub: {
    fontSize: 10,
    color: "#6B7280",
    marginTop: 2,
  },
  portNotes: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    marginBottom: 12,
  },
  portNotesLabel: {
    fontSize: 11,
    color: "#475569",
  },
  portWhy: {
    fontSize: 11,
    color: "#6B7280",
    fontStyle: "italic",
    marginBottom: 8,
  },
  portMeta: {
    fontSize: 9,
    color: "#94A3B8",
    textAlign: "right",
  },
  bottomStatus: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  bottomStatusText: {
    color: "white",
    fontSize: 11,
    fontWeight: "600",
  },
});

export default SmartOpportunitiesAlpacaUniverse;  