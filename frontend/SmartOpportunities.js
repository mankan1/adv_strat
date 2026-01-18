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
  Linking, // ✅ add
} from "react-native";

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

const DEV_ALPACA_KEY_ID = "AKNND2CVUEIRFCDNVMXL2NYVWD";
const DEV_ALPACA_SECRET = "5xBdG2Go1PtWE36wnCrB4vES6mGF6tkusqDL7uSnnCxy";
const DEV_TRADIER_TOKEN = "DZi4KKhQVv05kjgqXtvJRyiFbEhn";
/**
 * SmartOpportunitiesAlpacaUniverse
 *
 * - Universe comes DIRECTLY from Alpaca:
 *   - most-actives by volume (top<=100)
 *   - most-actives by trades (top<=100)
 *   - movers (gainers/losers)
 *   - snapshots to compute gaps + trending
 *
 * - Your backend stays unchanged:
 *   - GET {backendUrl}/market/quote/:symbol
 *   - GET {backendUrl}/options/chain/:symbol
 *   - GET {backendUrl}/market/overview (optional)
 *
 * - Unusual options activity computed from Tradier option chains:
 *   - GET https://api.tradier.com/v1/markets/options/expirations?symbol=XYZ
 *   - GET https://api.tradier.com/v1/markets/options/chains?symbol=XYZ&expiration=YYYY-MM-DD&greeks=true
 */

const DEFAULT_BACKEND = "http://localhost:5000";
const DEFAULT_ALPACA_DATA_BASE = "https://data.alpaca.markets";
const DEFAULT_TRADIER_BASE = "https://api.tradier.com";

const clampTop = (n) => Math.max(1, Math.min(100, Number.isFinite(n) ? n : 50)); // Alpaca top max 100
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  // ---------- Credentials / Settings ----------
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedUnusual, setSelectedUnusual] = useState(null);

  const [scanStoppedReason, setScanStoppedReason] = useState(""); // "rate-limited" | "cancelled" | ...
  const [partialResults, setPartialResults] = useState(false);
  const [scanCompletedSymbols, setScanCompletedSymbols] = useState(0);

  // const [alpacaKeyId, setAlpacaKeyId] = useState("");
  // const [alpacaSecret, setAlpacaSecret] = useState("");
  const [alpacaBase, setAlpacaBase] = useState(DEFAULT_ALPACA_DATA_BASE);
  const [alpacaKeyId, setAlpacaKeyId] = useState(DEV_HARDCODE_KEYS ? DEV_ALPACA_KEY_ID : "");
  const [alpacaSecret, setAlpacaSecret] = useState(DEV_HARDCODE_KEYS ? DEV_ALPACA_SECRET : "");
  const [tradierToken, setTradierToken] = useState(DEV_HARDCODE_KEYS ? DEV_TRADIER_TOKEN : "");

  
  // const [tradierToken, setTradierToken] = useState("");
  const [tradierBase, setTradierBase] = useState(DEFAULT_TRADIER_BASE);

  // Universe knobs
  const [universeTop, setUniverseTop] = useState(100);
  const [maxSymbolsToScan, setMaxSymbolsToScan] = useState(25); // you can raise, but scanning gets slow
  const [unusualSymbolsLimit, setUnusualSymbolsLimit] = useState(30); // to protect Tradier limits
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
  // const [universeMeta, setUniverseMeta] = useState({
  //   mostActiveVolume: [],
  //   topTraded: [],
  //   gainers: [],
  //   losers: [],
  //   gapUps: [],
  //   gapDowns: [],
  //   trending: [],
  //   merged: [],
  // });

  const [universeMeta, setUniverseMeta] = useState({
    mostActiveVolume: [],
    topTraded: [],
    gainers: [],
    losers: [],
    gapUps: [],
    gapDowns: [],
    trending: [],
    merged: [],
    mergedRows: [], // ✅ { symbol, price, changePct, volume }
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

  const [selectedOpp, setSelectedOpp] = useState(null);
  const [modalTab, setModalTab] = useState("details");
  const [activeTab, setActiveTab] = useState("high");

  // ---------- Unusual options activity ----------
  const [unusualLoading, setUnusualLoading] = useState(false);
  const [unusualError, setUnusualError] = useState("");
  const [unusualList, setUnusualList] = useState([]); // flattened unusual contracts
  const [activeMainTab, setActiveMainTab] = useState("opps"); // "opps" | "unusual" | "universe"

  const [filters] = useState({
    minProbability: 70,
    maxRisk: 500,
    minRewardRatio: 2,
    expiryDays: [0, 30],
    strategyTypes: ["debit-spread", "credit-spread", "iron-condor", "calendar"],
  });

  // ---------------------------
  // Persist settings (optional)
  // ---------------------------
  useEffect(() => {
    if (!AsyncStorage) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("smartOppSettingsV1");
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
      } catch {}
    })();
  }, []);

  const cancelScanRef = useRef(false);

  useEffect(() => {
    cancelScanRef.current = !scanning;
  }, [scanning]);

  const saveSettings = async () => {
    if (!AsyncStorage) return;
    try {
      await AsyncStorage.setItem(
        "smartOppSettingsV1",
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
        })
      );
    } catch {}
  };

  // ---------------------------
  // Alpaca helpers
  // ---------------------------
  const alpacaFetchJson = async (path, params = {}) => {
    if (!alpacaKeyId || !alpacaSecret) {
      throw new Error("Missing Alpaca Key ID / Secret in Settings.");
    }

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
    if (!tradierToken) {
      throw new Error("Missing Tradier token in Settings.");
    }

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

    const json = await res.json();
    return json;
  };

  // ---------------------------
  // Universe builder
  // ---------------------------
  const loadUniverseFromAlpaca = async () => {
    setUniverseLoading(true);
    setUniverseError("");

    try {
      const top = clampTop(universeTop);

      // 1) Most active by volume (Alpaca requires by=volume or trades, top<=100)
      const mostActiveVolume = includeSources.mostActiveVolume
        ? await alpacaFetchJson("/v1beta1/screener/stocks/most-actives", {
            by: "volume",
            top,
          })
        : null;

      // 2) Most active by trades (aka “top traded”)
      const topTraded = includeSources.topTraded
        ? await alpacaFetchJson("/v1beta1/screener/stocks/most-actives", {
            by: "trades",
            top,
          })
        : null;

      // 3) Movers (gainers/losers)
      // const movers = includeSources.moversGainers || includeSources.moversLosers
      //   ? await alpacaFetchJson("/v1beta1/screener/stocks/movers", { top })
      //   : null;
      const movers =
      includeSources.moversGainers || includeSources.moversLosers
        ? await alpacaFetchJson("/v1beta1/screener/stocks/movers") // ✅ NO top param
        : null;

      const mostActiveVolumeSyms = (mostActiveVolume?.most_actives || mostActiveVolume?.mostActives || [])
        .map((x) => x.symbol)
        .filter(Boolean);

      const topTradedSyms = (topTraded?.most_actives || topTraded?.mostActives || [])
        .map((x) => x.symbol)
        .filter(Boolean);

      const gainersSyms = (movers?.gainers || []).map((x) => x.symbol).filter(Boolean);
      const losersSyms = (movers?.losers || []).map((x) => x.symbol).filter(Boolean);

      // Merge base universe BEFORE snapshot-based gap/trending
      const baseUnion = uniq([
        ...(includeSources.mostActiveVolume ? mostActiveVolumeSyms : []),
        ...(includeSources.topTraded ? topTradedSyms : []),
        ...(includeSources.moversGainers ? gainersSyms : []),
        ...(includeSources.moversLosers ? losersSyms : []),
      ]);

      // 4) Snapshots for gap + trending calculations
      // Alpaca supports snapshots per symbol. For a larger list, chunk requests.
      // Endpoint: /v2/stocks/snapshots?symbols=... :contentReference[oaicite:3]{index=3}
      const chunkSize = 200; // safe-ish
      const snapshotMap = {};
      for (let i = 0; i < baseUnion.length; i += chunkSize) {
        const chunk = baseUnion.slice(i, i + chunkSize);
        const snap = await alpacaFetchJson("/v2/stocks/snapshots", {
          symbols: chunk.join(","),
        });

        // Snapshots response: { [symbol]: { dailyBar, prevDailyBar, latestTrade, ... } }
        Object.assign(snapshotMap, snap || {});
        await sleep(120); // small spacing
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

          return {
            symbol: sym,
            gapPct,
            dayChangePct,
            dayVol,
          };
        })
        .filter(Boolean);

      const gapUps = gapStats
        .slice()
        .sort((a, b) => b.gapPct - a.gapPct)
        .slice(0, top)
        .map((x) => x.symbol);

      const gapDowns = gapStats
        .slice()
        .sort((a, b) => a.gapPct - b.gapPct)
        .slice(0, top)
        .map((x) => x.symbol);

      // Trending heuristic: blend abs(dayChangePct) + log(volume)
      // (You can replace this with your preferred “trending” definition.)
      const trending = gapStats
        .map((x) => {
          const absMove = Math.abs(x.dayChangePct ?? 0);
          const volScore = Math.log10((x.dayVol ?? 0) + 1);
          const score = absMove * 1.2 + volScore * 3;
          return { ...x, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, top)
        .map((x) => x.symbol);

      // Final merged list based on toggles
      const merged = uniq([
        ...(includeSources.mostActiveVolume ? mostActiveVolumeSyms : []),
        ...(includeSources.topTraded ? topTradedSyms : []),
        ...(includeSources.moversGainers ? gainersSyms : []),
        ...(includeSources.moversLosers ? losersSyms : []),
        ...(includeSources.gapUps ? gapUps : []),
        ...(includeSources.gapDowns ? gapDowns : []),
        ...(includeSources.trending ? trending : []),
      // ]).slice(0, Math.max(1, maxSymbolsToScan));
      ]).slice(0, top); // ✅ show up to 100 in Universe

      // setUniverseMeta({
      //   mostActiveVolume: mostActiveVolumeSyms,
      //   topTraded: topTradedSyms,
      //   gainers: gainersSyms,
      //   losers: losersSyms,
      //   gapUps,
      //   gapDowns,
      //   trending,
      //   merged,
      // });

      // Build rows with price + change + volume from snapshots
      const mergedRows = merged.map((sym) => {
        const s = snapshotMap?.[sym];
        const daily = s?.dailyBar;
        const prev = s?.prevDailyBar;
        const last =
          s?.latestTrade?.p ??
          s?.latestQuote?.ap ??
          daily?.c ??
          daily?.o ??
          null;

        const vol = daily?.v ?? 0;

        const prevClose = prev?.c ?? null;
        const changePct =
          prevClose && last ? ((last - prevClose) / prevClose) * 100 : null;

        return {
          symbol: sym,
          price: last,
          changePct,
          volume: vol,
        };
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
        mergedRows, // ✅
      });      
    } catch (e) {
      setUniverseError(String(e?.message || e));
    } finally {
      setUniverseLoading(false);
    }
  };
  const openYahoo = (symbol) => {
    const url = `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert("Link error", "Could not open Yahoo Finance.");
    });
  };
  const isRateLimitError = (errOrText) => {
    const msg = String(errOrText || "").toLowerCase();
    return (
      msg.includes("rate limit") ||
      msg.includes("too many requests") ||
      msg.includes("429") ||
      msg.includes("limit exceeded")
    );
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
  // Opportunities scoring helpers (your existing logic)
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
    if (opp.probability >= 68 && opp.probability < 70) {
      reasons.push(`Probability just below threshold (${opp.probability}% vs 70%)`);
    }
    if (opp.rewardRiskRatio >= 1.8 && opp.rewardRiskRatio < 2) {
      reasons.push(`Reward/Risk ratio close (${opp.rewardRiskRatio}:1 vs 2:1)`);
    }
    if (opp.score >= 75 && opp.score < 80) {
      reasons.push(`Overall score near threshold (${opp.score} vs 80)`);
    }
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

  const createOpportunity = (
    symbol,
    strategy,
    type,
    expiration,
    daysToExpiry,
    cost,
    maxLoss,
    maxProfit,
    probability,
    avgIV,
    setup,
    greeks,
    reason,
    currentPrice
  ) => {
    const rewardRiskRatio =
      typeof maxLoss === "number" && maxLoss > 0
        ? typeof maxProfit === "number"
          ? maxProfit / maxLoss
          : 3
        : "N/A";

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

  const generateOpportunitiesByProbability = (
    symbol,
    expiration,
    daysToExpiry,
    currentPrice,
    calls,
    puts,
    avgIV,
    withinRange
  ) => {
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
            { longCall: longCall.strike, shortCall: shortCall.strike },
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
        const probability = 63;

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
            probability,
            avgIV,
            { longPut: longPut.strike, shortPut: shortPut.strike },
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

      all.push(
        ...generateOpportunitiesByProbability(
          symbol,
          expiration,
          daysToExpiry,
          currentPrice,
          calls,
          puts,
          avgIV,
          withinRange
        )
      );
    }

    return all;
  };

  // ---------------------------
  // Scan opportunities using Alpaca-derived universe
  // ---------------------------
  // const symbolsToScan = useMemo(() => universeMeta.merged || [], [universeMeta.merged]);
  const symbolsToScan = useMemo(
    () => (universeMeta.merged || []).slice(0, Math.max(1, maxSymbolsToScan)),
    [universeMeta.merged, maxSymbolsToScan]
  );

  // const scanOpportunities = async () => {
  //   if (!symbolsToScan.length) {
  //     Alert.alert("No symbols", "Load Universe from Alpaca first (Universe tab).");
  //     return;
  //   }

  //   setLoading(true);
  //   setScanning(true);
  //   cancelScanRef.current = false;

  //   setScanProgress(0);
  //   setScanStatus("Initializing scan...");

  //   setScanStoppedReason("");
  //   setPartialResults(false);
  //   setScanCompletedSymbols(0);

  //   const allOpportunities = [];
  //   let completed = 0;

  //   try {

  //     for (let i = 0; i < symbolsToScan.length; i++) {
        
  //       if (cancelScanRef.current) {
  //         setScanStoppedReason("cancelled");
  //         setPartialResults(allOpportunities.length > 0);
  //         break;
  //       }

  //       const symbol = symbolsToScan[i];
  //       setScanStatus(`Analyzing ${symbol} (${i + 1}/${symbolsToScan.length})...`);

  //       try {
  //         // Quotes
  //         const quoteResponse = await fetch(`${backendUrl}/market/quote/${symbol}`);
  //         if (!quoteResponse.ok) continue;
  //         const quoteData = await quoteResponse.json();
  //         if (!quoteData.success || !quoteData.last) continue;

  //         // Options chain
  //         const optionsResponse = await fetch(`${backendUrl}/options/chain/${symbol}`);
  //         if (!optionsResponse.ok) continue;
  //         const optionsData = await optionsResponse.json();
  //         if (!optionsData.success || !optionsData.options) continue;

  //         const symbolOpps = await analyzeSymbol(symbol, quoteData, optionsData.options);
  //         allOpportunities.push(...symbolOpps);
  //       } catch (err) {
  //         // keep moving
  //       }

  //       setScanProgress(((i + 1) / symbolsToScan.length) * 100);
  //       await sleep(150); // tiny pacing
  //     }

  //     const { highProb, mediumProb, lowProb, nearMiss } = categorizeOpportunities(allOpportunities);
  //     const sortByScore = (a, b) => b.score - a.score;

  //     setOpportunities(highProb.sort(sortByScore));
  //     setMediumProbOpportunities(mediumProb.sort(sortByScore));
  //     setLowProbOpportunities(lowProb.sort(sortByScore));
  //     setNearMissOpportunities(nearMiss.sort(sortByScore));

  //     setScanStatus(`Found ${allOpportunities.length} total opportunities`);
  //   } catch (error) {
  //     Alert.alert("Scan Error", `Failed to scan opportunities: ${error.message}`);
  //   } finally {
  //     setLoading(false);
  //     setTimeout(() => {
  //       setScanning(false);
  //       setScanProgress(100);
  //     }, 800);
  //   }
  // };

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
  
    // IMPORTANT: don’t wipe existing results until you have new ones
    const allOpportunities = [];
    let completed = 0;
    let stoppedReasonLocal = "";

    try {
      for (let i = 0; i < symbolsToScan.length; i++) {
        if (cancelScanRef.current) {
          setScanStoppedReason("cancelled");
          setPartialResults(allOpportunities.length > 0);
          break;
        }
  
        const symbol = symbolsToScan[i];
        setScanStatus(`Analyzing ${symbol} (${i + 1}/${symbolsToScan.length})...`);
  
        try {
          // Quotes
          const quoteRes = await fetch(`${backendUrl}/market/quote/${symbol}`);
          const quoteParsed = await safeJson(quoteRes);
  
          if (!quoteParsed.ok) {
            if (quoteParsed.status === 429 || isRateLimitError(quoteParsed.text)) {
              setScanStoppedReason("rate-limited");
              setPartialResults(allOpportunities.length > 0);
              break;
            }
            // skip this symbol
            continue;
          }
  
          const quoteData = quoteParsed.json;
          if (!quoteData?.success || !quoteData?.last) continue;
  
          // Options chain
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
          // If backend throws a rate-limit error message, treat it the same
          if (isRateLimitError(err?.message || err)) {
            stoppedReasonLocal = "rate-limited";
            setScanStoppedReason("rate-limited");
            setPartialResults(allOpportunities.length > 0);
            break;
          }
          // else ignore this symbol and keep going
        }
  
        setScanProgress(((i + 1) / symbolsToScan.length) * 100);
        await sleep(150);
      }
  
      // ✅ categorize whatever we have (even partial)
      const { highProb, mediumProb, lowProb, nearMiss } = categorizeOpportunities(allOpportunities);
      const sortByScore = (a, b) => b.score - a.score;
  
      setOpportunities(highProb.sort(sortByScore));
      setMediumProbOpportunities(mediumProb.sort(sortByScore));
      setLowProbOpportunities(lowProb.sort(sortByScore));
      setNearMissOpportunities(nearMiss.sort(sortByScore));
  
      // if (scanStoppedReason === "rate-limited") {
      //   setScanStatus(`Rate-limited — showing partial results (${completed}/${symbolsToScan.length} symbols).`);
      // } else {
      //   setScanStatus(`Found ${allOpportunities.length} total opportunities`);
      // }
      if (stoppedReasonLocal === "rate-limited") {
        setScanStatus(`Rate-limited — showing partial results (${completed}/${symbolsToScan.length} symbols).`);
      } else {
        setScanStatus(`Found ${allOpportunities.length} total opportunities`);
      }      
    } catch (error) {
      generateSampleData();
      // even here, keep what we have
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

    // Heuristic:
    // - volume / open_interest high
    // - volume above a floor
    // - optionally prioritize near-the-money
    const scored = list
      .map((o) => {
        const vol = Number(o.volume || 0);
        const oi = Number(o.open_interest || 0);
        const iv = Number(o.iv || 0);
        const delta = o.greeks?.delta ?? o.delta ?? null;

        // const voi = (vol + 1) / (oi + 1);
        const voiRaw = (vol + 1) / (oi + 1);
        const voi = Math.min(20, voiRaw); // cap it

        const volFloorOk = vol >= 200; // adjust
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

      // mild concurrency to avoid hammering Tradier
      const perSymbol = await withConcurrency(targets, 3, async (sym) => {
        // 1) get expirations
        const exps = await tradierFetchJson("/v1/markets/options/expirations", {
          symbol: sym,
          includeAllRoots: "true",
        });

        const dates = exps?.expirations?.date;
        const expList = Array.isArray(dates) ? dates : dates ? [dates] : [];
        if (!expList.length) return [];

        // choose the soonest expiration that’s at least 3 days out
        const now = Date.now();
        const picked = expList
          .map((d) => ({ d, t: new Date(d).getTime() }))
          .filter((x) => x.t > now + 3 * 24 * 60 * 60 * 1000)
          .sort((a, b) => a.t - b.t)[0]?.d;

        if (!picked) return [];

        // 2) get chain (with greeks)
        const chain = await tradierFetchJson("/v1/markets/options/chains", {
          symbol: sym,
          expiration: picked,
          greeks: "true",
        });

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
                style={[
                  styles.tab,
                  activeTab === tab.id && styles.activeTab,
                  activeTab === tab.id && { borderBottomColor: tab.color },
                ]}
                onPress={() => setActiveTab(tab.id)}
              >
                <View style={styles.tabContent}>
                  <Text
                    style={[
                      styles.tabLabel,
                      activeTab === tab.id && styles.activeTabLabel,
                      activeTab === tab.id && { color: tab.color },
                    ]}
                  >
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

  const renderSelectedModal = () => {
    if (!selectedOpp) return null;

    return (
      <Modal animationType="slide" transparent visible onRequestClose={() => setSelectedOpp(null)}>
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
              <TouchableOpacity
                style={[styles.modalTab, modalTab === "details" && styles.activeModalTab]}
                onPress={() => setModalTab("details")}
              >
                <Text style={[styles.modalTabText, modalTab === "details" && styles.activeModalTabText]}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalTab, modalTab === "trade" && styles.activeModalTab]}
                onPress={() => setModalTab("trade")}
              >
                <Text style={[styles.modalTabText, modalTab === "trade" && styles.activeModalTabText]}>Setup</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              {modalTab === "details" ? (
                <ScrollView>
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Trade Details</Text>
                    <Text style={styles.modalTextLine}>Expiration: {selectedOpp.expiration}</Text>
                    <Text style={styles.modalTextLine}>DTE: {selectedOpp.daysToExpiry}</Text>
                    <Text style={styles.modalTextLine}>IV%: {selectedOpp.ivPercentile}%</Text>
                    <Text style={styles.modalTextLine}>Max Profit: ${selectedOpp.maxProfit}</Text>
                    <Text style={styles.modalTextLine}>Max Loss: ${selectedOpp.maxLoss}</Text>
                    <Text style={styles.modalTextLine}>R/R: {selectedOpp.rewardRiskRatio}:1</Text>
                  </View>
                  {selectedOpp.reason ? (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Why</Text>
                      <Text style={styles.reasonModalText}>{selectedOpp.reason}</Text>
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                <ScrollView style={{ padding: 16 }}>
                  <Text style={styles.modalSectionTitle}>Setup</Text>
                  <Text style={styles.reasonModalText}>{JSON.stringify(selectedOpp.setup, null, 2)}</Text>
                  <Text style={[styles.reasonModalText, { marginTop: 12 }]}>{JSON.stringify(selectedOpp.greeks, null, 2)}</Text>
                </ScrollView>
              )}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  Alert.alert("Paper Trade", "Hook up your broker routing here if/when you want.");
                  setSelectedOpp(null);
                }}
              >
                <Text style={styles.modalButtonText}>📈 Paper Trade This</Text>
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

            <TouchableOpacity style={styles.cancelButton} onPress={() => setScanning(false)}>
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
        <View style={[styles.modalContent, { maxHeight: "90%" }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Settings</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setSettingsOpen(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 16 }}>
            <Text style={styles.settingsSection}>Alpaca (Market Data)</Text>
            <Text style={styles.settingsHint}>Uses Data API for screeners + snapshots.</Text>
            <TextInput
              style={styles.input}
              placeholder="Alpaca Key ID"
              value={alpacaKeyId}
              onChangeText={setAlpacaKeyId}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Alpaca Secret Key"
              value={alpacaSecret}
              onChangeText={setAlpacaSecret}
              autoCapitalize="none"
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="Alpaca Data Base URL"
              value={alpacaBase}
              onChangeText={setAlpacaBase}
              autoCapitalize="none"
            />

            <View style={styles.hr} />

            <Text style={styles.settingsSection}>Tradier (Unusual Options)</Text>
            <Text style={styles.settingsHint}>
              We compute “unusual” from volume/open-interest spikes using option chains. :contentReference[oaicite:4]{index=4}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Tradier Bearer Token"
              value={tradierToken}
              onChangeText={setTradierToken}
              autoCapitalize="none"
              secureTextEntry
            />
            <TextInput
              style={styles.input}
              placeholder="Tradier Base URL"
              value={tradierBase}
              onChangeText={setTradierBase}
              autoCapitalize="none"
            />

            <View style={styles.hr} />

            <Text style={styles.settingsSection}>Universe Controls</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Alpaca top (max 100)</Text>
                <TextInput
                  style={styles.input}
                  value={String(universeTop)}
                  onChangeText={(t) => setUniverseTop(Number(t || 0))}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsLabel}>Max symbols to scan</Text>
                <TextInput
                  style={styles.input}
                  value={String(maxSymbolsToScan)}
                  onChangeText={(t) => setMaxSymbolsToScan(Number(t || 0))}
                  keyboardType="numeric"
                />
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
              <TouchableOpacity
                key={k}
                style={[styles.toggleRow, v ? styles.toggleOn : styles.toggleOff]}
                onPress={() => setIncludeSources((prev) => ({ ...prev, [k]: !prev[k] }))}
              >
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

            <Text style={styles.smallNote}>
              Note: If you’re using Expo Web, avoid file:// origin. Run a dev server so your origin matches backend CORS.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderUniverseTab = () => (
    <ScrollView style={{ flex: 1 }}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Universe</Text>
        <Text style={styles.panelSub}>
          Pulled from Alpaca: most-actives (volume), most-actives (trades), movers; then snapshots derive gaps + trending.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={loadUniverseFromAlpaca}
          disabled={universeLoading}
        >
          {universeLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Load Universe from Alpaca</Text>}
        </TouchableOpacity>

        {universeError ? <Text style={styles.errorText}>{universeError}</Text> : null}

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
        <Text style={[styles.panelTitle, { marginTop: 10, fontSize: 16 }]}>
          Merged symbols ({universeMeta.mergedRows?.length || 0})
        </Text>

        <View style={styles.universeTableHeader}>
          <Text style={[styles.universeCell, styles.universeCellSym]}>Symbol</Text>
          <Text style={[styles.universeCell, styles.universeCellNum]}>Price</Text>
          <Text style={[styles.universeCell, styles.universeCellNum]}>Chg%</Text>
          <Text style={[styles.universeCell, styles.universeCellNum]}>Vol</Text>
        </View>

        {(universeMeta.mergedRows || []).slice(0, 100).map((r) => {
          const priceText = r.price == null ? "—" : Number(r.price).toFixed(2);
          const chgText = r.changePct == null ? "—" : `${r.changePct.toFixed(2)}%`;
          const volText = r.volume == null ? "—" : String(r.volume);

          const chgStyle =
            r.changePct == null
              ? null
              : r.changePct >= 0
              ? styles.pos
              : styles.neg;

          return (
            <TouchableOpacity
              key={r.symbol}
              style={styles.universeRow}
              onPress={() => openYahoo(r.symbol)}
              activeOpacity={0.85}
            >
              <Text style={[styles.universeCell, styles.universeCellSym, styles.universeLink]}>
                {r.symbol}
              </Text>
              <Text style={[styles.universeCell, styles.universeCellNum]}>{priceText}</Text>
              <Text style={[styles.universeCell, styles.universeCellNum, chgStyle]}>{chgText}</Text>
              <Text style={[styles.universeCell, styles.universeCellNum]}>{volText}</Text>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.smallNote}>
          Tip: Tap a row to open Yahoo Finance for that symbol.
        </Text>
      </View>
    </ScrollView>
  );

  const renderUnusualTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Unusual Options Activity</Text>
        <Text style={styles.panelSub}>
          Computed from Tradier option chains using volume/open-interest spikes (heuristic). :contentReference[oaicite:5]{index=5}
        </Text>

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
            <TouchableOpacity
              key={`${u.symbol}-${idx}`}
              style={styles.unusualCard}
              activeOpacity={0.85}
              onPress={() => setSelectedUnusual(u)}
            >
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
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderUnusualModal = () => {
    if (!selectedUnusual) return null;
  
    const u = selectedUnusual;
    const mid =
      (Number(u.bid || 0) + Number(u.ask || 0)) > 0
        ? ((Number(u.bid || 0) + Number(u.ask || 0)) / 2).toFixed(2)
        : "—";
  
    return (
      <Modal
        animationType="slide"
        transparent
        visible
        onRequestClose={() => setSelectedUnusual(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalTitle}>{u.underlying} • Unusual Contract</Text>
                <Text style={styles.modalSubtitle}>{u.symbol}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setSelectedUnusual(null)}
              >
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
                <Text style={styles.modalSectionTitle}>Liquidity / Flow</Text>
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
                <Text style={styles.modalSectionTitle}>Greeks / IV</Text>
                <Text style={styles.modalTextLine}>IV: {u.iv ? `${(u.iv * 100).toFixed(2)}%` : "—"}</Text>
                <Text style={styles.modalTextLine}>Delta: {u.delta ?? "—"}</Text>
              </View>
  
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Why it’s flagged</Text>
                <Text style={styles.reasonModalText}>{u.reason}</Text>
              </View>
            </ScrollView>
  
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalButton}
                onPress={() => {
                  Alert.alert("Next step", "Hook this into your order ticket / broker routing.");
                }}
              >
                <Text style={styles.modalButtonText}>Open Trade Ticket</Text>
              </TouchableOpacity>
  
              <TouchableOpacity
                style={[styles.modalButton, styles.secondaryButton]}
                onPress={() => setSelectedUnusual(null)}
              >
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };
  const renderOppsTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>🎯 Smart Options Opportunities</Text>
        <Text style={styles.subtitle}>
          Universe from Alpaca • Options scan uses your backend: {backendUrl}
        </Text>
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
              Analyzes {symbolsToScan.length || 0} symbols (from Alpaca).{" "}
              {!symbolsToScan.length ? "Load Universe first." : ""}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {partialResults ? (
        <View style={styles.partialBanner}>
          <Text style={styles.partialBannerText}>
            ⚠️ Scan stopped ({scanStoppedReason || "unknown"}). Showing results from {scanCompletedSymbols} symbols.
          </Text>
          <TouchableOpacity
            style={styles.partialBannerBtn}
            onPress={() => scanOpportunities()}
            disabled={loading}
          >
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

      <View style={styles.statsFooter}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{opportunities.length}</Text>
          <Text style={styles.statLabel}>High</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{mediumProbOpportunities.length}</Text>
          <Text style={styles.statLabel}>Medium</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{lowProbOpportunities.length}</Text>
          <Text style={styles.statLabel}>Low</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{nearMissOpportunities.length}</Text>
          <Text style={styles.statLabel}>Near Miss</Text>
        </View>
      </View>
    </View>
  );

  const MainTabs = () => (
    <View style={styles.mainTabs}>
      {[
        ["opps", "Opportunities"],
        ["unusual", "Unusual Options"],
        ["universe", "Universe"],
      ].map(([id, label]) => (
        <TouchableOpacity
          key={id}
          style={[styles.mainTab, activeMainTab === id && styles.mainTabActive]}
          onPress={() => setActiveMainTab(id)}
        >
          <Text style={[styles.mainTabText, activeMainTab === id && styles.mainTabTextActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.mainTabRight} onPress={() => setSettingsOpen(true)}>
        <Text style={styles.mainTabText}>⚙️</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <MainTabs />
      {activeMainTab === "opps" ? renderOppsTab() : activeMainTab === "unusual" ? renderUnusualTab() : renderUniverseTab()}

      {renderSelectedModal()}
      {renderUnusualModal()}
      {renderScanningOverlay()}
      {renderSettingsModal()}
    </View>
  );
  
};
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },

  tapHint: {
    marginTop: 10,
    fontSize: 11,
    fontWeight: "800",
    color: "#2563eb",
  },

  mainTabs: {
    flexDirection: "row",
    backgroundColor: "#111827",
    paddingTop: Platform.OS === "ios" ? 44 : 10,
    paddingHorizontal: 8,
    paddingBottom: 10,
    alignItems: "center",
  },
  mainTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    marginRight: 8,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  mainTabActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  mainTabText: { color: "rgba(255,255,255,0.85)", fontWeight: "700", fontSize: 12 },
  mainTabTextActive: { color: "white" },
  mainTabRight: {
    marginLeft: "auto",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.10)",
  },

  header: { backgroundColor: "#667eea", padding: 18, paddingTop: 16 },
  title: { fontSize: 20, fontWeight: "bold", color: "white", marginBottom: 6 },
  subtitle: { fontSize: 12, color: "rgba(255,255,255,0.85)" },

  topButtonsRow: { flexDirection: "row", paddingHorizontal: 12, paddingTop: 10, gap: 10 },
  smallButton: {
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  smallButtonText: { color: "white", fontWeight: "800", fontSize: 12 },

  scanButton: {
    margin: 12,
    backgroundColor: "#4CAF50",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  scanButtonText: { color: "white", fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  scanButtonSubtext: { color: "rgba(255,255,255,0.85)", fontSize: 11 },

  partialBanner: {
    marginHorizontal: 12,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  partialBannerText: {
    flex: 1,
    fontWeight: "900",
    color: "#92400E",
    fontSize: 12,
  },
  partialBannerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  partialBannerBtnText: { color: "white", fontWeight: "900", fontSize: 12 },

  tabsContainer: { marginHorizontal: 12, marginBottom: 10 },
  tabsInner: { flexDirection: "row" },
  tab: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: "transparent", marginRight: 8 },
  activeTab: { borderBottomWidth: 3 },
  tabContent: { flexDirection: "row", alignItems: "center" },
  tabLabel: { fontSize: 13, fontWeight: "700", color: "#666", marginRight: 8 },
  activeTabLabel: { fontWeight: "900" },
  countBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: "900" },

  opportunitiesSection: { flex: 1, marginHorizontal: 12 },
  opportunitiesList: { flex: 1 },

  emptyState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyStateIcon: { fontSize: 44, marginBottom: 15, opacity: 0.35 },
  emptyStateTitle: { fontSize: 16, fontWeight: "800", color: "#666", marginBottom: 8 },
  emptyStateText: { fontSize: 13, color: "#999", textAlign: "center" },

  opportunityCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  opportunityHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  symbolContainer: { flexDirection: "row", alignItems: "center" },
  symbolText: { fontSize: 18, fontWeight: "900", color: "#333", marginRight: 10 },
  strategyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  strategyText: { fontSize: 11, fontWeight: "800" },

  scoreContainer: { alignItems: "center" },
  scoreLabel: { fontSize: 10, color: "#666", marginBottom: 4 },
  scoreCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#667eea", justifyContent: "center", alignItems: "center" },
  scoreText: { color: "white", fontSize: 14, fontWeight: "900" },

  nearMissBadge: { backgroundColor: "#FEF3C7", padding: 8, borderRadius: 8, marginBottom: 10, borderWidth: 1, borderColor: "#F59E0B" },
  nearMissText: { fontSize: 12, color: "#92400E", fontWeight: "700" },

  opportunityDetails: { marginBottom: 8 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  detailItem: { flex: 1, marginRight: 10 },
  detailLabel: { fontSize: 11, color: "#666", marginBottom: 5, fontWeight: "700" },
  detailValue: { fontSize: 15, fontWeight: "900", color: "#333" },

  probabilityBar: { height: 6, backgroundColor: "#f0f0f0", borderRadius: 3, marginBottom: 5, overflow: "hidden" },
  probabilityFill: { height: "100%", borderRadius: 3 },

  profitText: { color: "#10B981" },
  lossText: { color: "#EF4444" },

  reasonText: { fontSize: 12, color: "#666", fontStyle: "italic", marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#f0f0f0" },

  statsFooter: { flexDirection: "row", backgroundColor: "white", padding: 14, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 16, fontWeight: "900", color: "#667eea", marginBottom: 4 },
  statLabel: { fontSize: 12, color: "#666", fontWeight: "700" },

  // modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 16 },
  modalContent: { backgroundColor: "white", borderRadius: 15, width: "100%", maxHeight: "80%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "#111827" },
  modalSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 6, fontWeight: "700" },
  modalCloseButton: { padding: 6 },
  modalClose: { fontSize: 22, color: "#999" },

  modalTabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  modalTab: { flex: 1, padding: 12, alignItems: "center" },
  activeModalTab: { borderBottomWidth: 3, borderBottomColor: "#667eea" },
  modalTabText: { fontSize: 13, color: "#666", fontWeight: "700" },
  activeModalTabText: { color: "#667eea", fontWeight: "900" },
  modalBody: { flex: 1, minHeight: 360 },
  modalSection: { padding: 16, borderBottomWidth: 1, borderBottomColor: "#f0f0f0" },
  modalSectionTitle: { fontSize: 15, fontWeight: "900", color: "#111827", marginBottom: 10 },
  modalTextLine: { fontSize: 13, color: "#374151", marginBottom: 6, fontWeight: "700" },
  reasonModalText: { fontSize: 13, color: "#6B7280", lineHeight: 18, fontWeight: "600" },

  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  modalButton: { backgroundColor: "#4CAF50", padding: 14, borderRadius: 10, alignItems: "center", marginBottom: 10 },
  modalButtonText: { color: "white", fontSize: 15, fontWeight: "900" },
  secondaryButton: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#ddd" },
  secondaryButtonText: { color: "#666", fontSize: 15, fontWeight: "800" },

  // scanning overlay
  scanOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center" },
  scanModal: { backgroundColor: "white", borderRadius: 15, padding: 24, width: "80%", alignItems: "center" },
  scanTitle: { fontSize: 16, fontWeight: "900", color: "#111827", marginTop: 12, marginBottom: 8 },
  scanStatus: { fontSize: 13, color: "#6B7280", marginBottom: 14, textAlign: "center", fontWeight: "700" },
  progressBar: { width: "100%", height: 8, backgroundColor: "#f0f0f0", borderRadius: 4, overflow: "hidden", marginBottom: 10 },
  progressFill: { height: "100%", backgroundColor: "#667eea" },
  scanProgress: { fontSize: 14, fontWeight: "900", color: "#111827", marginBottom: 14 },
  cancelButton: { padding: 10 },
  cancelButtonText: { color: "#6B7280", fontSize: 13, fontWeight: "800" },

  // panels / universe / unusual
  panel: { backgroundColor: "white", margin: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#eef2f7" },
  panelTitle: { fontSize: 18, fontWeight: "900", color: "#111827", marginBottom: 6 },
  panelSub: { fontSize: 12, color: "#6B7280", fontWeight: "700" },

  primaryButton: { marginTop: 12, backgroundColor: "#111827", padding: 12, borderRadius: 10, alignItems: "center" },
  primaryButtonText: { color: "white", fontWeight: "900" },

  errorText: { color: "#b91c1c", fontWeight: "800", marginTop: 10 },

  metaGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metaCell: { width: "47%", backgroundColor: "#f9fafb", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#eef2f7" },
  metaKey: { color: "#6B7280", fontSize: 12, fontWeight: "800" },
  metaVal: { color: "#111827", fontSize: 18, fontWeight: "900", marginTop: 4 },

  monoWrap: { marginTop: 8, fontSize: 12, color: "#111827", fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) },

  unusualCard: { backgroundColor: "white", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "#eef2f7" },
  unusualHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  unusualUnderlying: { fontSize: 16, fontWeight: "900", color: "#111827" },
  unusualScore: { fontSize: 12, fontWeight: "900", color: "#2563eb" },
  unusualSymbol: { marginTop: 8, fontSize: 13, fontWeight: "900", color: "#111827" },
  unusualRow: { marginTop: 8, flexDirection: "row", gap: 10, alignItems: "center" },
  unusualPill: { backgroundColor: "#111827", color: "white", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontWeight: "900", fontSize: 12 },
  unusualRowText: { fontSize: 12, fontWeight: "800", color: "#374151" },
  unusualReason: { marginTop: 10, fontSize: 12, fontWeight: "700", color: "#6B7280" },

  // settings
  settingsSection: { fontSize: 14, fontWeight: "900", color: "#111827", marginTop: 10 },
  settingsHint: { fontSize: 12, fontWeight: "700", color: "#6B7280", marginBottom: 8 },
  settingsLabel: { fontSize: 12, fontWeight: "800", color: "#374151", marginBottom: 6 },

  input: { backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10, padding: 10, marginBottom: 10, fontWeight: "700" },
  hr: { height: 1, backgroundColor: "#eef2f7", marginVertical: 8 },

  row: { flexDirection: "row" },

  toggleRow: { padding: 10, borderRadius: 10, marginBottom: 8, borderWidth: 1 },
  toggleOn: { backgroundColor: "#ecfdf5", borderColor: "#34d399" },
  toggleOff: { backgroundColor: "#f9fafb", borderColor: "#e5e7eb" },
  toggleText: { fontWeight: "900", color: "#111827" },

  smallNote: { marginTop: 12, fontSize: 11, color: "#6B7280", fontWeight: "700" },
  universeTableHeader: {
    marginTop: 10,
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  universeRow: {
    marginTop: 8,
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#eef2f7",
    alignItems: "center",
  },
  universeCell: {
    fontSize: 12,
    fontWeight: "900",
    color: "#111827",
  },
  universeCellSym: { flex: 1 },
  universeCellNum: { width: 72, textAlign: "right" },
  universeLink: { color: "#2563eb" },
  pos: { color: "#10B981" },
  neg: { color: "#EF4444" },
  universeTableHeader: {
    marginTop: 10,
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#f9fafb",
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  universeRow: {
    marginTop: 8,
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#eef2f7",
    alignItems: "center",
  },
  universeCell: {
    fontSize: 12,
    fontWeight: "900",
    color: "#111827",
  },
  universeCellSym: { flex: 1 },
  universeCellNum: { width: 72, textAlign: "right" },
  universeLink: { color: "#2563eb" },
  pos: { color: "#10B981" },
  neg: { color: "#EF4444" },    
});

export default SmartOpportunitiesAlpacaUniverse;
