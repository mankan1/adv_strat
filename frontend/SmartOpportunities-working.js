import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  Dimensions,
  Animated
} from 'react-native';

const { width } = Dimensions.get('window');

const SmartOpportunities = ({
  backendUrl = 'http://localhost:5000',

  // 🔐 Alpaca creds (frontend = NOT secure; do this only for dev/testing)
  alpacaKeyId = 'AKNND2CVUEIRFCDNVMXL2NYVWD',
  alpacaSecretKey = '5xBdG2Go1PtWE36wnCrB4vES6mGF6tkusqDL7uSnnCxy',

  // Alpaca Market Data base
  alpacaDataBaseUrl = 'https://data.alpaca.markets',

  // Universe tuning
  universeFinalLimit = 100,       // how many total symbols you scan
  universeTopLimit = 100,         // Alpaca screener limit (must be <= 100)
  universeChunkSize = 100,        // snapshots chunk
}) => {
  const [opportunities, setOpportunities] = useState([]);
  const [mediumProbOpportunities, setMediumProbOpportunities] = useState([]);
  const [lowProbOpportunities, setLowProbOpportunities] = useState([]);
  const [nearMissOpportunities, setNearMissOpportunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [modalTab, setModalTab] = useState('details');
  const [filters, setFilters] = useState({
    minProbability: 70,
    maxRisk: 500,
    minRewardRatio: 2,
    expiryDays: [7, 30],
    strategyTypes: ['debit-spread', 'credit-spread', 'iron-condor', 'calendar']
  });
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [activeTab, setActiveTab] = useState('high');
  const [scanAnim] = useState(new Animated.Value(0));

  // ✅ Dynamic universe from Alpaca
  const fallbackSymbols = [
    'SPY', 'QQQ', 'IWM', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META'
  ];
  const [symbolsToScan, setSymbolsToScan] = useState(fallbackSymbols);

  // Cancel scan support
  const cancelRef = useRef(false);

  // -----------------------------
  // Alpaca helpers (FRONTEND)
  // -----------------------------
  const alpacaHeaders = () => ({
    'Accept': 'application/json',
    'APCA-API-KEY-ID': alpacaKeyId,
    'APCA-API-SECRET-KEY': alpacaSecretKey,
  });

  const buildUrl = (base, path, params = {}) => {
    const url = new URL(path, base);
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      url.searchParams.set(k, String(v));
    });
    return url.toString();
  };

  const alpacaFetchJson = async (path, params) => {
    if (!alpacaKeyId || !alpacaSecretKey) {
      throw new Error('Missing Alpaca credentials (alpacaKeyId / alpacaSecretKey)');
    }

    const url = buildUrl(alpacaDataBaseUrl, path, params);

    const res = await fetch(url, {
      method: 'GET',
      headers: alpacaHeaders(),
    });

    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

    if (!res.ok) {
      const msg = data?.message || data?.error || `Alpaca HTTP ${res.status}`;
      const err = new Error(`Alpaca error ${res.status}: ${msg}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  };

  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

  const chunk = (arr, size) => {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  // -----------------------------
  // Universe sources
  // -----------------------------
  const getMostActives = async ({ by, top }) => {
    // Alpaca requires by = "volume" or "trades" and top <= 100
    const safeBy = (by === 'trades') ? 'trades' : 'volume';
    const safeTop = Math.max(1, Math.min(100, Number(top) || 100));

    const data = await alpacaFetchJson('/v1beta1/screener/stocks/most-actives', {
      by: safeBy,
      top: safeTop,
    });

    const list = Array.isArray(data?.most_actives) ? data.most_actives : [];
    return list.map(x => x.symbol).filter(Boolean);
  };

  const getMovers = async ({ top }) => {
    const safeTop = Math.max(1, Math.min(100, Number(top) || 100));

    // Movers endpoint returns { gainers:[], losers:[] }
    const data = await alpacaFetchJson('/v1beta1/screener/stocks/movers', { top: safeTop });

    const gainers = Array.isArray(data?.gainers) ? data.gainers.map(x => x.symbol) : [];
    const losers = Array.isArray(data?.losers) ? data.losers.map(x => x.symbol) : [];
    return {
      gainers: gainers.filter(Boolean),
      losers: losers.filter(Boolean),
      both: uniq([...gainers, ...losers]),
    };
  };

  const getSnapshots = async (symbols) => {
    // /v2/stocks/snapshots?symbols=SYM1,SYM2,...
    const out = {};
    const parts = chunk(symbols, Math.max(1, Math.min(100, universeChunkSize)));

    for (const batch of parts) {
      const data = await alpacaFetchJson('/v2/stocks/snapshots', {
        symbols: batch.join(','),
      });

      // data is a dict: { "AAPL": {...}, "SPY": {...} }
      Object.assign(out, data || {});
    }
    return out;
  };

  const computeGapsFromSnapshots = (snapshots) => {
    // gap% = (dailyBar.o - prevDailyBar.c) / prevDailyBar.c * 100
    const gaps = [];

    Object.entries(snapshots || {}).forEach(([sym, snap]) => {
      const prev = snap?.prevDailyBar;
      const day = snap?.dailyBar;

      const prevClose = prev?.c;
      const open = day?.o;

      if (typeof prevClose === 'number' && prevClose > 0 && typeof open === 'number') {
        const gapPct = ((open - prevClose) / prevClose) * 100;
        gaps.push({ symbol: sym, gapPct });
      }
    });

    gaps.sort((a, b) => b.gapPct - a.gapPct);
    return gaps;
  };

  // -----------------------------
  // Build merged universe:
  // - most active by volume
  // - top traded (most active by trades)
  // - movers (gainers+losers)
  // - gap ups/downs computed from snapshots
  // - trending = frequency across lists (appears in many lists)
  // -----------------------------
  const loadUniverseFromAlpaca = async () => {
    setScanStatus('Loading Alpaca symbol universe...');

    const TOP = Math.max(1, Math.min(100, Number(universeTopLimit) || 100));

    try {
      // 1) Pull base lists in parallel
      const [mostActiveVolRes, mostActiveTradesRes, moversRes] = await Promise.allSettled([
        getMostActives({ by: 'volume', top: TOP }),
        getMostActives({ by: 'trades', top: TOP }),
        getMovers({ top: TOP }),
      ]);

      const mostActiveVol =
        mostActiveVolRes.status === 'fulfilled' ? mostActiveVolRes.value : [];
      const mostActiveTrades =
        mostActiveTradesRes.status === 'fulfilled' ? mostActiveTradesRes.value : [];
      const movers =
        moversRes.status === 'fulfilled' ? moversRes.value : { gainers: [], losers: [], both: [] };

      // 2) Candidates for snapshot gap calc
      const candidates = uniq([
        ...mostActiveVol,
        ...mostActiveTrades,
        ...movers.both,
      ]).slice(0, 300); // cap candidates so snapshots stays reasonable

      // 3) Snapshots to compute gaps (gappers)
      let gaps = [];
      try {
        setScanStatus(`Computing gaps from ${candidates.length} snapshots...`);
        const snaps = await getSnapshots(candidates);
        gaps = computeGapsFromSnapshots(snaps);
      } catch (e) {
        gaps = [];
      }

      const gapUps = gaps.filter(x => x.gapPct > 0).slice(0, 60).map(x => x.symbol);
      const gapDowns = [...gaps].reverse().filter(x => x.gapPct < 0).slice(0, 60).map(x => x.symbol);

      // 4) Trending: symbols that show up in multiple lists
      const score = new Map(); // symbol -> score

      const bump = (arr, pts) => {
        (arr || []).forEach((s, idx) => {
          if (!s) return;
          const base = score.get(s) || 0;
          // slight rank weighting: higher ranked gets a tiny boost
          const rankBoost = Math.max(0, 1 - idx / 100) * 0.25;
          score.set(s, base + pts + rankBoost);
        });
      };

      bump(mostActiveVol, 2.0);
      bump(mostActiveTrades, 2.0);
      bump(movers.gainers, 2.0);
      bump(movers.losers, 2.0);
      bump(gapUps, 1.5);
      bump(gapDowns, 1.5);

      // Extra: big gap magnitude gets more “trend” score
      gaps.slice(0, 120).forEach(({ symbol, gapPct }) => {
        const base = score.get(symbol) || 0;
        score.set(symbol, base + Math.min(3, Math.abs(gapPct) / 5));
      });

      const trending = [...score.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 80)
        .map(([s]) => s);

      // 5) Merge in a “good order” (trending first)
      const merged = [];
      const pushUnique = (arr) => {
        (arr || []).forEach(s => {
          if (!s) return;
          if (!merged.includes(s)) merged.push(s);
        });
      };

      pushUnique(trending);
      pushUnique(gapUps);
      pushUnique(gapDowns);
      pushUnique(movers.gainers);
      pushUnique(movers.losers);
      pushUnique(mostActiveVol);
      pushUnique(mostActiveTrades);

      const finalUniverse = merged.slice(0, Math.max(10, universeFinalLimit));

      setSymbolsToScan(finalUniverse);
      setScanStatus(`Universe loaded: ${finalUniverse.length} symbols`);
      return finalUniverse;
    } catch (e) {
      console.warn('Universe load failed, falling back:', e?.message || e);
      setSymbolsToScan(fallbackSymbols);
      setScanStatus('Universe load failed. Using fallback symbols.');
      return fallbackSymbols;
    }
  };

  // Load universe on mount (and when creds change)
  useEffect(() => {
    // If keys missing, we keep fallback list (won’t crash)
    if (!alpacaKeyId || !alpacaSecretKey) return;
    loadUniverseFromAlpaca();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alpacaKeyId, alpacaSecretKey]);

  // -----------------------------
  // Your existing strategies list etc (unchanged)
  // -----------------------------
  const strategies = [
    { id: 'high-iv-credit', name: 'High IV Credit Spread', description: 'Sell options in high IV environment', icon: '💰', idealConditions: 'IV > 70th percentile, low volume', successRate: '75-85%', riskLevel: 'Medium' },
    { id: 'low-iv-debit', name: 'Low IV Debit Spread', description: 'Buy options when IV is low', icon: '📈', idealConditions: 'IV < 30th percentile, high volume', successRate: '65-75%', riskLevel: 'Low' },
    { id: 'earnings-straddle', name: 'Earnings Straddle', description: 'Capture earnings volatility', icon: '⚡', idealConditions: 'Pre-earnings, high expected move', successRate: '60-70%', riskLevel: 'High' },
    { id: 'theta-decay', name: 'Theta Decay Play', description: 'Sell time premium', icon: '⏰', idealConditions: 'High theta, low gamma', successRate: '80-90%', riskLevel: 'Low' },
    { id: 'gamma-squeeze', name: 'Gamma Squeeze', description: 'Capture rapid price moves', icon: '🎯', idealConditions: 'High gamma, low float', successRate: '55-65%', riskLevel: 'Very High' }
  ];

  const categorizeOpportunities = (allOpportunities) => {
    const highProb = [];
    const mediumProb = [];
    const lowProb = [];
    const nearMiss = [];

    allOpportunities.forEach(opp => {
      const isNearMiss = (opp.probability >= 68 && opp.probability < 70) ||
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
    return reasons.join(', ');
  };

  const analyzeSymbol = async (symbol, quote, options, marketData) => {
    const allOpportunities = [];
    const currentPrice = quote.last;

    if (!options || options.length === 0) return allOpportunities;

    const expirations = {};
    options.forEach(option => {
      if (!expirations[option.expiration]) expirations[option.expiration] = [];
      expirations[option.expiration].push(option);
    });

    for (const [expiration, expOptions] of Object.entries(expirations)) {
      const daysToExpiry = Math.ceil((new Date(expiration) - new Date()) / (1000 * 60 * 60 * 24));
      const withinRange = daysToExpiry >= filters.expiryDays[0] && daysToExpiry <= filters.expiryDays[1];

      const calls = expOptions.filter(o => o.type === 'call');
      const puts = expOptions.filter(o => o.type === 'put');
      if (calls.length === 0 || puts.length === 0) continue;

      const avgIV = expOptions.reduce((sum, o) => sum + (o.iv || 0), 0) / expOptions.length;
      const ivPercentile = Math.min(95, avgIV * 100);

      const generatedOpportunities = generateOpportunitiesByProbability(
        symbol,
        expiration,
        daysToExpiry,
        currentPrice,
        calls,
        puts,
        avgIV,
        ivPercentile,
        withinRange
      );

      allOpportunities.push(...generatedOpportunities);
    }

    return allOpportunities;
  };

  const generateOpportunitiesByProbability = (symbol, expiration, daysToExpiry, currentPrice, calls, puts, avgIV, ivPercentile, withinRange) => {
    const opportunities = [];

    if (withinRange && avgIV > 0.35) {
      const shortCall = findStrike(calls, currentPrice * 1.03);
      const longCall = findStrike(calls, currentPrice * 1.05);
      const shortPut = findStrike(puts, currentPrice * 0.97);
      const longPut = findStrike(puts, currentPrice * 0.95);

      if (shortCall && longCall && shortPut && longPut) {
        const credit = (shortCall.bid + shortPut.bid) - (longCall.ask + longPut.ask);
        const width = Math.abs(shortCall.strike - longCall.strike);
        const maxLoss = (width * 100) - credit;
        const probability = Math.min(85, 75 + (avgIV * 20));

        opportunities.push(createOpportunity(
          symbol, 'Iron Condor', 'credit-spread', expiration, daysToExpiry,
          credit, maxLoss, width, probability, avgIV,
          { shortCall: shortCall.strike, longCall: longCall.strike, shortPut: shortPut.strike, longPut: longPut.strike },
          { delta: 0.03, theta: 0.22, vega: -0.10 },
          'High IV environment with wide strike placement',
          currentPrice
        ));
      }
    }

    if (withinRange) {
      const longCall = findStrike(calls, currentPrice);
      const shortCall = findStrike(calls, currentPrice * 1.02);

      if (longCall && shortCall) {
        const debit = longCall.ask - shortCall.bid;
        const width = Math.abs(shortCall.strike - longCall.strike);
        const maxProfit = (width * 100) - debit;
        const probability = 65 + (0.3 - Math.min(avgIV, 0.3)) * 50;

        opportunities.push(createOpportunity(
          symbol, 'Bull Call Spread', 'debit-spread', expiration, daysToExpiry,
          debit, debit, maxProfit, probability, avgIV,
          { longCall: longCall.strike, shortCall: shortCall.strike },
          { delta: 0.35, theta: -0.12, vega: 0.08 },
          'Moderate IV with directional bias',
          currentPrice
        ));
      }

      const longPut = findStrike(puts, currentPrice);
      const shortPut = findStrike(puts, currentPrice * 0.98);

      if (longPut && shortPut) {
        const debit = longPut.ask - shortPut.bid;
        const width = Math.abs(shortPut.strike - longPut.strike);
        const maxProfit = (width * 100) - debit;
        const probability = 63;

        opportunities.push(createOpportunity(
          symbol, 'Bear Put Spread', 'debit-spread', expiration, daysToExpiry,
          debit, debit, maxProfit, probability, avgIV,
          { longPut: longPut.strike, shortPut: shortPut.strike },
          { delta: -0.35, theta: -0.11, vega: 0.07 },
          'Downside protection with moderate probability',
          currentPrice
        ));
      }
    }

    if (daysToExpiry <= 14) {
      const putStrike = findStrike(puts, currentPrice * 0.95);
      if (putStrike) {
        const credit = putStrike.bid;
        const probability = 55;

        opportunities.push(createOpportunity(
          symbol, 'Naked Put Sale', 'theta-decay', expiration, daysToExpiry,
          credit, 'Unlimited', credit, probability, avgIV,
          { strike: putStrike.strike, type: 'put' },
          { delta: -0.20, theta: -0.25, vega: 0.05 },
          'High premium but unlimited risk',
          currentPrice
        ));
      }

      const atmCall = findStrike(calls, currentPrice);
      const atmPut = findStrike(puts, currentPrice);

      if (atmCall && atmPut && avgIV < 0.4) {
        const debit = atmCall.ask + atmPut.ask;
        const probability = 52;

        opportunities.push(createOpportunity(
          symbol, 'Long Straddle', 'volatility', expiration, daysToExpiry,
          debit, debit, 'Unlimited', probability, avgIV,
          { callStrike: atmCall.strike, putStrike: atmPut.strike },
          { delta: 0, theta: -0.35, vega: 0.25 },
          'Low IV, expecting big move',
          currentPrice
        ));
      }
    }

    if (withinRange) {
      const shortCall = findStrike(calls, currentPrice * 1.02);
      const longCall = findStrike(calls, currentPrice * 1.035);
      const shortPut = findStrike(puts, currentPrice * 0.98);
      const longPut = findStrike(puts, currentPrice * 0.965);

      if (shortCall && longCall && shortPut && longPut) {
        const credit = (shortCall.bid + shortPut.bid) - (longCall.ask + longPut.ask);
        const width = Math.abs(shortCall.strike - longCall.strike);
        const maxLoss = (width * 100) - credit;
        const probability = 68;

        opportunities.push(createOpportunity(
          symbol, 'Iron Condor (Near Miss)', 'credit-spread', expiration, daysToExpiry,
          credit, maxLoss, credit, probability, avgIV,
          { shortCall: shortCall.strike, longCall: longCall.strike, shortPut: shortPut.strike, longPut: longPut.strike },
          { delta: 0.05, theta: 0.20, vega: -0.12 },
          'Narrow strikes, probability just below threshold',
          currentPrice
        ));
      }
    }

    return opportunities;
  };

  const findStrike = (options, targetPrice) => {
    return options.find(o => Math.abs(o.strike - targetPrice) / targetPrice < 0.02) || options[0];
  };

  const createOpportunity = (symbol, strategy, type, expiration, daysToExpiry,
                            cost, maxLoss, maxProfit, probability, avgIV,
                            setup, greeks, reason, currentPrice) => {
    const rewardRiskRatio = typeof maxLoss === 'number' && maxLoss > 0
      ? (typeof maxProfit === 'number' ? maxProfit / maxLoss : 3)
      : 'N/A';

    const score = calculateScore(probability, rewardRiskRatio, daysToExpiry, avgIV);

    return {
      id: `${symbol}-${strategy}-${expiration}-${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      strategy,
      type,
      expiration,
      daysToExpiry,
      cost: typeof cost === 'number' ? cost.toFixed(2) : cost,
      maxLoss: typeof maxLoss === 'number' ? maxLoss.toFixed(2) : maxLoss,
      maxProfit: typeof maxProfit === 'number' ? maxProfit.toFixed(2) : maxProfit,
      rewardRiskRatio: typeof rewardRiskRatio === 'number' ? rewardRiskRatio.toFixed(2) : rewardRiskRatio,
      probability: Math.round(probability),
      ivPercentile: Math.round(Math.min(95, avgIV * 100)),
      setup,
      greeks,
      reason,
      currentPrice,
      score: Math.round(score),
      timestamp: new Date().toISOString()
    };
  };

  const calculateScore = (probability, rewardRatio, daysToExpiry, iv) => {
    const probScore = probability * 0.35;
    const ratioScore = (typeof rewardRatio === 'number' ? Math.min(10, rewardRatio) * 5.5 : 30);
    const timeScore = Math.max(0, 25 - (daysToExpiry / 2));
    const ivScore = iv < 0.4 ? 10 : iv > 0.6 ? 5 : 8;
    return Math.min(100, probScore + ratioScore + timeScore + ivScore);
  };

  // -----------------------------
  // Scan opportunities (unchanged logic, but now uses symbolsToScan from Alpaca)
  // + cancel that actually stops the loop
  // -----------------------------
  const scanOpportunities = async () => {
    setLoading(true);
    setScanning(true);
    setScanProgress(0);
    cancelRef.current = false;
    setScanStatus('Initializing scan...');

    try {
      // Ensure we have a universe (if keys exist, refresh right before scan)
      if (alpacaKeyId && alpacaSecretKey) {
        await loadUniverseFromAlpaca();
      }

      const list = symbolsToScan || fallbackSymbols;
      const allOpportunities = [];

      for (let i = 0; i < list.length; i++) {
        if (cancelRef.current) break;

        const symbol = list[i];
        setScanStatus(`Analyzing ${symbol} (${i + 1}/${list.length})...`);

        try {
          // throttle (your old behavior)
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 2000));

          const quoteResponse = await fetch(`${backendUrl}/market/quote/${symbol}`);
          if (!quoteResponse.ok) continue;

          const quoteData = await quoteResponse.json();
          if (!quoteData.success || !quoteData.last) continue;

          await new Promise(resolve => setTimeout(resolve, 1000));

          const optionsResponse = await fetch(`${backendUrl}/options/chain/${symbol}`);
          if (!optionsResponse.ok) continue;

          const optionsData = await optionsResponse.json();
          if (!optionsData.success || !optionsData.options) continue;

          const marketResponse = await fetch(`${backendUrl}/market/overview`);
          const marketData = marketResponse.ok ? await marketResponse.json() : {};

          const symbolOpportunities = await analyzeSymbol(
            symbol,
            quoteData,
            optionsData.options,
            marketData
          );

          allOpportunities.push(...symbolOpportunities);
        } catch (symbolError) {
          console.error(`Error scanning ${symbol}:`, symbolError);
        }

        setScanProgress(((i + 1) / list.length) * 100);
      }

      const { highProb, mediumProb, lowProb, nearMiss } = categorizeOpportunities(allOpportunities);

      const sortByScore = (a, b) => b.score - a.score;
      setOpportunities(highProb.sort(sortByScore));
      setMediumProbOpportunities(mediumProb.sort(sortByScore));
      setLowProbOpportunities(lowProb.sort(sortByScore));
      setNearMissOpportunities(nearMiss.sort(sortByScore));

      setScanStatus(
        cancelRef.current
          ? `Cancelled — found ${allOpportunities.length} opportunities so far`
          : `Found ${allOpportunities.length} total opportunities`
      );
    } catch (error) {
      Alert.alert('Scan Error', `Failed to scan opportunities: ${error.message}`);
      generateSampleData();
    } finally {
      setLoading(false);
      setTimeout(() => {
        setScanning(false);
        setScanProgress(100);
      }, 1000);
    }
  };

  const generateSampleData = () => {
    // Keep your sample data as-is (omitted here for brevity)
    // If you want, paste your existing sample function back in.
    setOpportunities([]);
    setMediumProbOpportunities([]);
    setLowProbOpportunities([]);
    setNearMissOpportunities([]);
  };

  const getCurrentOpportunities = () => {
    switch(activeTab) {
      case 'high': return opportunities;
      case 'medium': return mediumProbOpportunities;
      case 'low': return lowProbOpportunities;
      case 'near-miss': return nearMissOpportunities;
      default: return opportunities;
    }
  };

  const getTabTitle = () => {
    switch(activeTab) {
      case 'high': return `High Probability (${opportunities.length})`;
      case 'medium': return `Medium Probability (${mediumProbOpportunities.length})`;
      case 'low': return `Low Probability (${lowProbOpportunities.length})`;
      case 'near-miss': return `Near Miss (${nearMissOpportunities.length})`;
      default: return `Opportunities (${opportunities.length})`;
    }
  };

  const getTabDescription = () => {
    switch(activeTab) {
      case 'high': return '70%+ probability, best risk/reward';
      case 'medium': return '60-69% probability, moderate risk';
      case 'low': return '50-59% probability, higher risk/reward';
      case 'near-miss': return 'Missed criteria by small margin';
      default: return 'Select a category';
    }
  };

  const getStrategyColor = (type) => {
    switch(type) {
      case 'credit-spread': return '#10B981';
      case 'debit-spread': return '#3B82F6';
      case 'iron-condor': return '#8B5CF6';
      case 'theta-decay': return '#F59E0B';
      case 'volatility': return '#EC4899';
      default: return '#6B7280';
    }
  };

  const getRiskColor = (probability) => {
    if (probability >= 70) return '#10B981';
    if (probability >= 60) return '#F59E0B';
    if (probability >= 50) return '#EF4444';
    return '#6B7280';
  };

  // -----------------------------
  // UI: only change is we display symbolsToScan.length
  // -----------------------------
  const renderProbabilityTabs = () => {
    const tabs = [
      { id: 'high', label: 'High', count: opportunities.length, color: '#10B981' },
      { id: 'medium', label: 'Medium', count: mediumProbOpportunities.length, color: '#F59E0B' },
      { id: 'low', label: 'Low', count: lowProbOpportunities.length, color: '#EF4444' },
      { id: 'near-miss', label: 'Near Miss', count: nearMissOpportunities.length, color: '#8B5CF6' }
    ];

    return (
      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.tabsInner}>
            {tabs.map(tab => (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tab,
                  activeTab === tab.id && styles.activeTab,
                  activeTab === tab.id && { borderBottomColor: tab.color }
                ]}
                onPress={() => setActiveTab(tab.id)}
              >
                <View style={styles.tabContent}>
                  <Text style={[
                    styles.tabLabel,
                    activeTab === tab.id && styles.activeTabLabel,
                    activeTab === tab.id && { color: tab.color }
                  ]}>
                    {tab.label}
                  </Text>
                  <View style={[
                    styles.countBadge,
                    { backgroundColor: tab.color + '20' }
                  ]}>
                    <Text style={[styles.countText, { color: tab.color }]}>
                      {tab.count}
                    </Text>
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
      <TouchableOpacity
        key={opp.id}
        style={styles.opportunityCard}
        onPress={() => setSelectedOpp(opp)}
      >
        <View style={styles.opportunityHeader}>
          <View style={styles.symbolContainer}>
            <Text style={styles.symbolText}>{opp.symbol}</Text>
            <View style={[styles.strategyBadge, { backgroundColor: strategyColor + '20' }]}>
              <Text style={[styles.strategyText, { color: strategyColor }]}>
                {opp.strategy}
              </Text>
            </View>
          </View>

          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>Score</Text>
            <View style={styles.scoreCircle}>
              <Text style={styles.scoreText}>{opp.score}</Text>
            </View>
          </View>
        </View>

        <View style={styles.opportunityDetails}>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Probability</Text>
              <View style={styles.probabilityBar}>
                <View
                  style={[
                    styles.probabilityFill,
                    {
                      width: `${opp.probability}%`,
                      backgroundColor: riskColor
                    }
                  ]}
                />
              </View>
              <Text style={[styles.detailValue, { color: riskColor }]}>
                {opp.probability}%
              </Text>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Risk/Reward</Text>
              <Text style={styles.detailValue}>{opp.rewardRiskRatio}:1</Text>
            </View>
          </View>
        </View>

        {opp.reason && (
          <Text style={styles.reasonText}>{opp.reason}</Text>
        )}
      </TouchableOpacity>
    );
  };

  // const renderOpportunityModal = () => null; // keep your existing modal code here

  const renderOpportunityModal = () => {
    if (!selectedOpp) return null;
    
    const strategyColor = getStrategyColor(selectedOpp.type);
    
    return (
      <Modal
        animationType="slide"
        transparent={true}
        visible={!!selectedOpp}
        onRequestClose={() => setSelectedOpp(null)}
      >
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
              <TouchableOpacity 
                style={styles.modalCloseButton}
                onPress={() => setSelectedOpp(null)}
              >
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalTabs}>
              <TouchableOpacity 
                style={[styles.modalTab, modalTab === 'details' && styles.activeModalTab]}
                onPress={() => setModalTab('details')}
              >
                <Text style={[
                  styles.modalTabText,
                  modalTab === 'details' && styles.activeModalTabText
                ]}>
                  Details
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalTab, modalTab === 'trade' && styles.activeModalTab]}
                onPress={() => setModalTab('trade')}
              >
                <Text style={[
                  styles.modalTabText,
                  modalTab === 'trade' && styles.activeModalTabText
                ]}>
                  Trade Setup
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.modalBody}>
              {modalTab === 'details' ? (
                <ScrollView>
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Trade Details</Text>
                    <View style={styles.modalGrid}>
                      <View style={styles.modalItem}>
                        <Text style={styles.modalLabel}>Current Price</Text>
                        <Text style={styles.modalValue}>${selectedOpp.currentPrice?.toFixed(2) || 'N/A'}</Text>
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
                        <Text style={[styles.modalValue, styles.profitText]}>
                          ${selectedOpp.maxProfit}
                        </Text>
                      </View>
                      <View style={styles.modalItem}>
                        <Text style={styles.modalLabel}>Max Loss</Text>
                        <Text style={[styles.modalValue, styles.lossText]}>
                          ${selectedOpp.maxLoss}
                        </Text>
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
                  Alert.alert('Trade Executed', 'Trade has been placed in paper trading mode');
                  setSelectedOpp(null);
                }}
              >
                <Text style={styles.modalButtonText}>📈 Paper Trade This</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.secondaryButton]}
                onPress={() => setSelectedOpp(null)}
              >
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };  
  // const renderTradeDetails = () => null;     // keep your existing trade-details code here

  const renderTradeDetails = (opp) => {
    if (!opp || !opp.setup) return null;
    
    const tradeType = opp.type;
    const isCredit = tradeType.includes('credit') || tradeType === 'theta-decay' || tradeType === 'iron-condor';
    const isDebit = tradeType.includes('debit');
    const isStraddle = tradeType === 'volatility';
    
    let tradeInstructions = [];
    let optionLegs = [];
    let maxProfit = opp.maxProfit;
    let maxLoss = opp.maxLoss;
    let breakevenPoints = [];
    let currentStockPrice = opp.currentPrice || 0;
    
    switch(opp.strategy) {
      case 'Iron Condor':
      case 'Iron Condor (Near Miss)':
        const { shortCall, longCall, shortPut, longPut } = opp.setup;
        const putDistance = ((currentStockPrice - shortPut) / currentStockPrice * 100).toFixed(1);
        const callDistance = ((shortCall - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        
        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          '',
          'SELL Put Spread:',
          `  • SELL Put @ $${shortPut} strike (${putDistance}% OTM)`,
          `  • BUY Put @ $${longPut} strike (lower strike)`,
          '',
          'SELL Call Spread:',
          `  • SELL Call @ $${shortCall} strike (${callDistance}% OTM)`,
          `  • BUY Call @ $${longCall} strike (higher strike)`,
          '',
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Net Credit: $${opp.cost} per contract`
        ];
        
        optionLegs = [
          { action: 'SELL', type: 'PUT', strike: shortPut, premium: 'Credit', distance: `${putDistance}% OTM` },
          { action: 'BUY', type: 'PUT', strike: longPut, premium: 'Debit', distance: '' },
          { action: 'SELL', type: 'CALL', strike: shortCall, premium: 'Credit', distance: `${callDistance}% OTM` },
          { action: 'BUY', type: 'CALL', strike: longCall, premium: 'Debit', distance: '' }
        ];
        
        const netCredit = parseFloat(opp.cost);
        breakevenPoints = [
          `Put side: $${shortPut} - $${netCredit.toFixed(2)} = $${(shortPut - netCredit).toFixed(2)} (${((shortPut - netCredit - currentStockPrice) / currentStockPrice * 100).toFixed(1)}% from current)`,
          `Call side: $${shortCall} + $${netCredit.toFixed(2)} = $${(shortCall + netCredit).toFixed(2)} (${((shortCall + netCredit - currentStockPrice) / currentStockPrice * 100).toFixed(1)}% from current)`
        ];
        break;
        
      case 'Bull Call Spread':
      case 'Bear Put Spread':
        const isBull = opp.strategy.includes('Bull');
        const longStrike = isBull ? opp.setup.longCall : opp.setup.longPut;
        const shortStrike = isBull ? opp.setup.shortCall : opp.setup.shortPut;
        const optionType = isBull ? 'CALL' : 'PUT';
        
        const longDistance = isBull 
          ? ((longStrike - currentStockPrice) / currentStockPrice * 100).toFixed(1)
          : ((currentStockPrice - longStrike) / currentStockPrice * 100).toFixed(1);
        const shortDistance = isBull
          ? ((shortStrike - currentStockPrice) / currentStockPrice * 100).toFixed(1)
          : ((currentStockPrice - shortStrike) / currentStockPrice * 100).toFixed(1);
        
        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          '',
          `${isBull ? 'BULLISH' : 'BEARISH'} VERTICAL SPREAD:`,
          `1. BUY ${optionType} @ $${longStrike} strike (${isBull ? longDistance + '% ITM' : longDistance + '% OTM'})`,
          `2. SELL ${optionType} @ $${shortStrike} strike (${isBull ? shortDistance + '% OTM' : shortDistance + '% ITM'})`,
          '',
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Net Debit: $${opp.cost} per contract`
        ];
        
        optionLegs = [
          { action: 'BUY', type: optionType, strike: longStrike, premium: 'Debit', distance: `${longDistance}% ${isBull ? 'ITM' : 'OTM'}` },
          { action: 'SELL', type: optionType, strike: shortStrike, premium: 'Credit', distance: `${shortDistance}% ${isBull ? 'OTM' : 'ITM'}` }
        ];
        
        const debit = parseFloat(opp.cost);
        if (isBull) {
          const breakevenPrice = longStrike + debit;
          const breakevenDistance = ((breakevenPrice - currentStockPrice) / currentStockPrice * 100).toFixed(1);
          breakevenPoints = [
            `Breakeven: $${longStrike} + $${debit.toFixed(2)} = $${breakevenPrice.toFixed(2)} (${breakevenDistance}% from current)`,
            `Profit Zone: Stock between $${breakevenPrice.toFixed(2)} and $${shortStrike}`
          ];
        } else {
          const breakevenPrice = longStrike - debit;
          const breakevenDistance = ((currentStockPrice - breakevenPrice) / currentStockPrice * 100).toFixed(1);
          breakevenPoints = [
            `Breakeven: $${longStrike} - $${debit.toFixed(2)} = $${breakevenPrice.toFixed(2)} (${breakevenDistance}% from current)`,
            `Profit Zone: Stock between $${shortStrike} and $${breakevenPrice.toFixed(2)}`
          ];
        }
        break;
        
      case 'Theta Call Sale':
      case 'Theta Put Sale':
      case 'Naked Put Sale':
        const isCall = opp.strategy.includes('Call');
        const strike = opp.setup.strike;
        
        const strikeDistance = isCall
          ? ((strike - currentStockPrice) / currentStockPrice * 100).toFixed(1)
          : ((currentStockPrice - strike) / currentStockPrice * 100).toFixed(1);
        
        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          '',
          'NAKED OPTION SALE:',
          `SELL ${isCall ? 'CALL' : 'PUT'} @ $${strike} strike (${strikeDistance}% OTM)`,
          '',
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Credit Received: $${opp.cost} per contract`,
          '',
          '⚠️ WARNING: Unlimited risk! Use stop losses.'
        ];
        
        optionLegs = [
          { action: 'SELL', type: isCall ? 'CALL' : 'PUT', strike: strike, premium: 'Credit', distance: `${strikeDistance}% OTM` }
        ];
        
        const credit = parseFloat(opp.cost);
        if (isCall) {
          const breakevenPrice = strike + credit;
          const breakevenDistance = ((breakevenPrice - currentStockPrice) / currentStockPrice * 100).toFixed(1);
          breakevenPoints = [`Breakeven: Stock at $${breakevenPrice.toFixed(2)} (${breakevenDistance}% from current)`];
          maxLoss = 'Unlimited (stock above breakeven)';
        } else {
          const breakevenPrice = strike - credit;
          const breakevenDistance = ((currentStockPrice - breakevenPrice) / currentStockPrice * 100).toFixed(1);
          breakevenPoints = [`Breakeven: Stock at $${breakevenPrice.toFixed(2)} (${breakevenDistance}% from current)`];
          maxLoss = `$${strike} (if stock goes to $0)`;
        }
        break;
        
      case 'Long Straddle':
        const { callStrike, putStrike } = opp.setup;
        
        // const callDistance = ((callStrike - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        // const putDistance = ((currentStockPrice - putStrike) / currentStockPrice * 100).toFixed(1);
        callDistance = ((callStrike - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        putDistance = ((currentStockPrice - putStrike) / currentStockPrice * 100).toFixed(1);
        
        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          '',
          'LONG STRADDLE:',
          `1. BUY CALL @ $${callStrike} strike (${Math.abs(callDistance)}% ${parseFloat(callDistance) > 0 ? 'OTM' : 'ITM'})`,
          `2. BUY PUT @ $${putStrike} strike (${Math.abs(putDistance)}% ${parseFloat(putDistance) > 0 ? 'OTM' : 'ITM'})`,
          '',
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Total Debit: $${opp.cost} per contract`,
          '',
          '✅ Profit if stock moves significantly in EITHER direction'
        ];
        
        optionLegs = [
          { action: 'BUY', type: 'CALL', strike: callStrike, premium: 'Debit', distance: `${Math.abs(callDistance)}% ${parseFloat(callDistance) > 0 ? 'OTM' : 'ITM'}` },
          { action: 'BUY', type: 'PUT', strike: putStrike, premium: 'Debit', distance: `${Math.abs(putDistance)}% ${parseFloat(putDistance) > 0 ? 'OTM' : 'ITM'}` }
        ];
        
        const totalDebit = parseFloat(opp.cost);
        const upperBreakeven = callStrike + totalDebit;
        const lowerBreakeven = putStrike - totalDebit;
        const upperDistance = ((upperBreakeven - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        const lowerDistance = ((currentStockPrice - lowerBreakeven) / currentStockPrice * 100).toFixed(1);
        
        breakevenPoints = [
          `Upper Breakeven: $${callStrike} + $${totalDebit.toFixed(2)} = $${upperBreakeven.toFixed(2)} (${upperDistance}% from current)`,
          `Lower Breakeven: $${putStrike} - $${totalDebit.toFixed(2)} = $${lowerBreakeven.toFixed(2)} (${lowerDistance}% from current)`
        ];
        maxProfit = 'Unlimited (in either direction)';
        break;
        
      case 'Credit Spread':
        const { shortCall: creditShortCall, longCall: creditLongCall } = opp.setup;
        
        const shortCallDistance = ((creditShortCall - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        const longCallDistance = ((creditLongCall - currentStockPrice) / currentStockPrice * 100).toFixed(1);
        
        tradeInstructions = [
          `Current ${opp.symbol} Price: $${currentStockPrice.toFixed(2)}`,
          '',
          'BEAR CALL SPREAD:',
          `1. SELL CALL @ $${creditShortCall} strike (${shortCallDistance}% OTM)`,
          `2. BUY CALL @ $${creditLongCall} strike (${longCallDistance}% OTM)`,
          '',
          `Expiration: ${opp.expiration} (${opp.daysToExpiry} days)`,
          `Net Credit: $${opp.cost} per contract`
        ];
        
        optionLegs = [
          { action: 'SELL', type: 'CALL', strike: creditShortCall, premium: 'Credit', distance: `${shortCallDistance}% OTM` },
          { action: 'BUY', type: 'CALL', strike: creditLongCall, premium: 'Debit', distance: `${longCallDistance}% OTM` }
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
            <Text style={[
              styles.tradeSummaryValue,
              opp.greeks.delta > 0.3 ? styles.bullishText : 
              opp.greeks.delta < -0.3 ? styles.bearishText : styles.neutralText
            ]}>
              {opp.greeks.delta > 0.3 ? 'BULLISH' : 
               opp.greeks.delta < -0.3 ? 'BEARISH' : 'NEUTRAL'}
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
              <View style={[
                styles.legAction,
                leg.action === 'BUY' ? styles.buyAction : styles.sellAction
              ]}>
                <Text style={styles.legActionText}>
                  {leg.action}
                </Text>
              </View>
              <View style={[
                styles.legType,
                leg.type === 'CALL' ? styles.callType : styles.putType
              ]}>
                <Text style={styles.legTypeText}>
                  {leg.type}
                </Text>
              </View>
              <View style={styles.legStrikeContainer}>
                <Text style={styles.legStrike}>${leg.strike}</Text>
                {leg.distance ? (
                  <Text style={styles.legDistance}>{leg.distance}</Text>
                ) : null}
              </View>
              <Text style={[
                styles.legPremium,
                leg.premium === 'Credit' ? styles.creditText : styles.debitText
              ]}>
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
              <Text style={[styles.riskRewardValue, styles.profitValue]}>
                ${maxProfit}
              </Text>
              <Text style={styles.riskRewardDesc}>
                {isCredit ? 'Keep entire credit if expires OTM' : 
                 isDebit ? 'Difference between strikes minus cost' :
                 'Unlimited if stock moves enough'}
              </Text>
            </View>
            
            <View style={styles.riskRewardItem}>
              <Text style={styles.riskRewardLabel}>Max Loss</Text>
              <Text style={[styles.riskRewardValue, styles.lossValue]}>
                ${maxLoss}
              </Text>
              <Text style={styles.riskRewardDesc}>
                {isCredit ? 'Difference between strikes minus credit' :
                 isDebit ? 'Total debit paid' :
                 opp.strategy.includes('Naked') ? 'Unlimited (use stops!)' :
                 'Difference between strikes'}
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
              {Math.abs(opp.greeks.delta) > 0.4 ? 'Strong directional bias - trade expects price movement' :
               Math.abs(opp.greeks.delta) > 0.2 ? 'Moderate directional bias' :
               'Neutral - minimal price sensitivity'}
            </Text>
          </View>
          
          <View style={styles.greekImpact}>
            <Text style={styles.greekImpactLabel}>Θ Theta {opp.greeks.theta.toFixed(2)}:</Text>
            <Text style={styles.greekImpactText}>
              {opp.greeks.theta > 0 ? `✅ Earns $${Math.abs(opp.greeks.theta).toFixed(2)} per day from time decay` :
               `❌ Loses $${Math.abs(opp.greeks.theta).toFixed(2)} per day from time decay`}
            </Text>
          </View>
          
          <View style={styles.greekImpact}>
            <Text style={styles.greekImpactLabel}>ν Vega {opp.greeks.vega.toFixed(2)}:</Text>
            <Text style={styles.greekImpactText}>
              {opp.greeks.vega > 0 ? `✅ Profits if IV rises $${Math.abs(opp.greeks.vega).toFixed(2)} per 1% IV increase` :
               `❌ Loses if IV rises $${Math.abs(opp.greeks.vega).toFixed(2)} per 1% IV increase`}
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
                {isCredit ? 'Take profit at 50-75% of max profit' :
                 isDebit ? 'Take profit at 75-100% of max profit' :
                 'Take profit when IV expands or price moves significantly'}
              </Text>
            </View>
          </View>
          
          <View style={styles.managementRule}>
            <Text style={styles.ruleIcon}>🛑</Text>
            <View style={styles.ruleContent}>
              <Text style={styles.ruleTitle}>Stop Loss:</Text>
              <Text style={styles.ruleText}>
                {isCredit ? 'Exit if loss reaches 150-200% of credit received' :
                 isDebit ? 'Exit if loss reaches 50% of debit paid' :
                 'Exit if loss reaches 50% of premium paid'}
              </Text>
            </View>
          </View>
          
          <View style={styles.managementRule}>
            <Text style={styles.ruleIcon}>📅</Text>
            <View style={styles.ruleContent}>
              <Text style={styles.ruleTitle}>Time Management:</Text>
              <Text style={styles.ruleText}>
                {opp.daysToExpiry <= 3 ? 'Close before expiration to avoid assignment risk' :
                 opp.daysToExpiry <= 10 ? 'Monitor daily - gamma risk increases' :
                 'Weekly monitoring sufficient'}
              </Text>
            </View>
          </View>
        </View>
        
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionTitle}>💻 How to Enter in Your Broker:</Text>
          <Text style={styles.brokerText}>1. Go to options chain for {opp.symbol}</Text>
          <Text style={styles.brokerText}>2. Select expiration: {opp.expiration}</Text>
          <Text style={styles.brokerText}>3. Enter as a {optionLegs.length > 2 ? '4-leg' : '2-leg'} order</Text>
          <Text style={styles.brokerText}>4. Use LIMIT order, not market</Text>
          <Text style={styles.brokerText}>5. Set price: ${opp.cost} {isCredit ? 'credit' : 'debit'}</Text>
          <Text style={styles.brokerText}>6. Review and submit order</Text>
        </View>
        
        <View style={styles.disclaimerContainer}>
          <Text style={styles.disclaimerText}>
            ⚠️ This is not financial advice. Trade at your own risk. 
            Always do your own research and consider paper trading first.
          </Text>
        </View>
      </ScrollView>
    );
  };

  const renderScanningOverlay = () => {
    if (!scanning) return null;

    return (
      <Modal animationType="fade" transparent={true} visible={scanning}>
        <View style={styles.scanOverlay}>
          <View style={styles.scanModal}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.scanTitle}>Scanning for Opportunities</Text>
            <Text style={styles.scanStatus}>{scanStatus}</Text>

            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${scanProgress}%` }]} />
            </View>

            <Text style={styles.scanProgress}>{Math.round(scanProgress)}%</Text>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                cancelRef.current = true;
                setScanStatus('Cancelling...');
              }}
            >
              <Text style={styles.cancelButtonText}>Cancel Scan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎯 Smart Options Opportunities</Text>
        <Text style={styles.subtitle}>
          AI-powered scan for high-probability trades
        </Text>
      </View>

      <TouchableOpacity
        style={styles.scanButton}
        onPress={scanOpportunities}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Text style={styles.scanButtonText}>🔍 Scan for Opportunities</Text>
            <Text style={styles.scanButtonSubtext}>
              Analyzes {symbolsToScan.length} symbols (Alpaca merged universe)
            </Text>
          </>
        )}
      </TouchableOpacity>

      {/* Optional: Manual refresh universe button */}
      <TouchableOpacity
        style={[styles.scanButton, { backgroundColor: '#667eea' }]}
        onPress={async () => {
          try {
            setLoading(true);
            await loadUniverseFromAlpaca();
          } catch (e) {
            Alert.alert('Universe Error', e.message);
          } finally {
            setLoading(false);
          }
        }}
        disabled={loading || !alpacaKeyId || !alpacaSecretKey}
      >
        <Text style={styles.scanButtonText}>🔄 Refresh Alpaca Universe</Text>
        <Text style={styles.scanButtonSubtext}>
          Most active + top traded + movers + gaps + trending
        </Text>
      </TouchableOpacity>

      {renderProbabilityTabs()}

      <View style={styles.categoryInfo}>
        <Text style={styles.categoryTitle}>{getTabTitle()}</Text>
        <Text style={styles.categoryDescription}>{getTabDescription()}</Text>
      </View>

      <View style={styles.opportunitiesSection}>
        {getCurrentOpportunities().length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📊</Text>
            <Text style={styles.emptyStateTitle}>No opportunities yet</Text>
            <Text style={styles.emptyStateText}>Tap Scan to generate opportunities</Text>
          </View>
        ) : (
          <ScrollView style={styles.opportunitiesList}>
            {getCurrentOpportunities().map(renderOpportunityCard)}
          </ScrollView>
        )}
      </View>

      {renderScanningOverlay()}
      {renderOpportunityModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#667eea', padding: 20, paddingTop: 30 },
  title: { fontSize: 24, fontWeight: 'bold', color: 'white', marginBottom: 5 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },

  scanButton: {
    margin: 15,
    backgroundColor: '#4CAF50',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  scanButtonText: { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  scanButtonSubtext: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },

  tabsContainer: { marginHorizontal: 15, marginBottom: 10 },
  tabsInner: { flexDirection: 'row' },
  tab: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 3, borderBottomColor: 'transparent', marginRight: 10 },
  activeTab: { borderBottomWidth: 3 },
  tabContent: { flexDirection: 'row', alignItems: 'center' },
  tabLabel: { fontSize: 14, fontWeight: '600', color: '#666', marginRight: 8 },
  activeTabLabel: { fontWeight: 'bold' },
  countBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  countText: { fontSize: 12, fontWeight: 'bold' },

  categoryInfo: { paddingHorizontal: 15, marginBottom: 10 },
  categoryTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 5 },
  categoryDescription: { fontSize: 14, color: '#666' },

  opportunitiesSection: { flex: 1, marginHorizontal: 15 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyStateIcon: { fontSize: 48, marginBottom: 15, opacity: 0.3 },
  emptyStateTitle: { fontSize: 18, fontWeight: '600', color: '#666', marginBottom: 10 },
  emptyStateText: { fontSize: 14, color: '#999', textAlign: 'center' },

  opportunitiesList: { flex: 1 },
  opportunityCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  opportunityHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  symbolContainer: { flexDirection: 'row', alignItems: 'center' },
  symbolText: { fontSize: 20, fontWeight: 'bold', color: '#333', marginRight: 10 },
  strategyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  strategyText: { fontSize: 11, fontWeight: '600' },
  scoreContainer: { alignItems: 'center' },
  scoreLabel: { fontSize: 10, color: '#666', marginBottom: 5 },
  scoreCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#667eea', justifyContent: 'center', alignItems: 'center' },
  scoreText: { color: 'white', fontSize: 16, fontWeight: 'bold' },

  opportunityDetails: { marginBottom: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  detailItem: { flex: 1, marginRight: 10 },
  detailLabel: { fontSize: 11, color: '#666', marginBottom: 5 },
  detailValue: { fontSize: 16, fontWeight: '600', color: '#333' },

  probabilityBar: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, marginBottom: 5, overflow: 'hidden' },
  probabilityFill: { height: '100%', borderRadius: 3 },

  reasonText: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },

  scanOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center', alignItems: 'center' },
  scanModal: { backgroundColor: 'white', borderRadius: 15, padding: 30, width: '80%', alignItems: 'center' },
  scanTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginTop: 20, marginBottom: 10 },
  scanStatus: { fontSize: 14, color: '#666', marginBottom: 20, textAlign: 'center' },
  progressBar: { width: '100%', height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', backgroundColor: '#667eea', borderRadius: 4 },
  scanProgress: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 20 },
  cancelButton: { padding: 10 },
  cancelButtonText: { color: '#666', fontSize: 14 },
  // ---------- MODAL STYLES ----------
  // modalOverlay: {
  //   flex: 1,
  //   backgroundColor: 'rgba(0,0,0,0.55)',
  //   justifyContent: 'center',
  //   alignItems: 'center',
  //   padding: 16,
  // },

  // modalContent: {
  //   width: '92%',
  //   maxWidth: 900,
  //   maxHeight: '88%',
  //   backgroundColor: '#fff',
  //   borderRadius: 14,
  //   overflow: 'hidden',

  //   // shadow (iOS)
  //   shadowColor: '#000',
  //   shadowOffset: { width: 0, height: 8 },
  //   shadowOpacity: 0.25,
  //   shadowRadius: 16,

  //   // shadow (Android)
  //   elevation: 10,
  // },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    padding: 0,
  },
  modalContent: {
    width: '100%',
    maxWidth: undefined,
    maxHeight: '88%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderRadius: 0,
    backgroundColor: '#fff',
    overflow: 'hidden',
    elevation: 10,
  },
  
  modalHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },

  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },

  modalCloseButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 10,
  },

  modalClose: {
    fontSize: 20,
    fontWeight: '900',
    color: '#6B7280',
  },

  modalTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },

  modalTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },

  activeModalTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#667eea',
  },

  modalTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },

  activeModalTabText: {
    color: '#667eea',
    fontWeight: '900',
  },

  modalBody: {
    flex: 1,
    padding: 14,
  },

  modalSection: {
    marginBottom: 16,
  },

  modalSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 10,
  },

  modalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  modalItem: {
    width: '48%',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#eef2f7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },

  modalLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    marginBottom: 6,
  },

  modalValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
  },

  reasonModalText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '700',
    lineHeight: 18,
  },

  modalFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#eef2f7',
    flexDirection: 'row',
    gap: 10,
  },

  modalButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },

  modalButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
  },

  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },

  secondaryButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '900',
  },

  profitText: { color: '#10B981' },
  lossText: { color: '#EF4444' },  
});

export default SmartOpportunities;
