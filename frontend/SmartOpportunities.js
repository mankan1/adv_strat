import React, { useState, useEffect } from 'react';
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

const SmartOpportunities = ({ backendUrl = 'http://localhost:5000' }) => {
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

  // const symbolsToScan = ['SPY', 'AAPL', 'QQQ'];
  const symbolsToScan = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN',//];
        "SOXS", "OCG", "YCBD", "NVDA", "CGC", "BBAI", "TQQQ", "SOXL", "WOK", "TZA", "PLUG", "SPY", "ASST", "TSLL", "RIVN", "AVGO", "TSLA", "TSLS", "MSOS", "ONDS", "INTC", "TLRY",

        "ATPC", "SLV", "QQQ", "IQ", "TNYA", "JDST", "XLF", "BEAT", "FRMI", "TE", "KAVL", "IWM", "SQQQ", "ASBP", "ORCL", "SOFI", "VIVK", "BMNR", "PFE", "ZDGE", "DNN", "OPEN", "NFLX",
        ];
        // "HPE", "F", "AAL", "PLTD", "IBIT", "ETHA", "TLT", "KVUE", "WBD", "HYG", "QID", "WULF", "UGRO", "MARA", "PLTR", "RR", "BMNU", "BYND", "VALE", "SPDN", "BAC", "UVIX", "AAPL",

        // "LQD", "ACHR", "APLT", "SNAP", "CLSK", "NVD", "BITF", "IVP", "AMD", "FNGD", "NU", "GOGL", "AMZN", "IREN", "IRBT", "RZLT", "CRWV", "BTG", "BITO", "T", "NCI", "CVE", "RIG",

        // "RKLB", "QBTS", "XLE", "NIO", "RWM", "MISL", "HOOD", "CIFR", "PL"];

  const strategies = [
    {
      id: 'high-iv-credit',
      name: 'High IV Credit Spread',
      description: 'Sell options in high IV environment',
      icon: '💰',
      idealConditions: 'IV > 70th percentile, low volume',
      successRate: '75-85%',
      riskLevel: 'Medium'
    },
    {
      id: 'low-iv-debit',
      name: 'Low IV Debit Spread',
      description: 'Buy options when IV is low',
      icon: '📈',
      idealConditions: 'IV < 30th percentile, high volume',
      successRate: '65-75%',
      riskLevel: 'Low'
    },
    {
      id: 'earnings-straddle',
      name: 'Earnings Straddle',
      description: 'Capture earnings volatility',
      icon: '⚡',
      idealConditions: 'Pre-earnings, high expected move',
      successRate: '60-70%',
      riskLevel: 'High'
    },
    {
      id: 'theta-decay',
      name: 'Theta Decay Play',
      description: 'Sell time premium',
      icon: '⏰',
      idealConditions: 'High theta, low gamma',
      successRate: '80-90%',
      riskLevel: 'Low'
    },
    {
      id: 'gamma-squeeze',
      name: 'Gamma Squeeze',
      description: 'Capture rapid price moves',
      icon: '🎯',
      idealConditions: 'High gamma, low float',
      successRate: '55-65%',
      riskLevel: 'Very High'
    }
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
    
    if (opp.probability >= 68 && opp.probability < 70) {
      reasons.push(`Probability just below threshold (${opp.probability}% vs 70%)`);
    }
    
    if (opp.rewardRiskRatio >= 1.8 && opp.rewardRiskRatio < 2) {
      reasons.push(`Reward/Risk ratio close (${opp.rewardRiskRatio}:1 vs 2:1)`);
    }
    
    if (opp.score >= 75 && opp.score < 80) {
      reasons.push(`Overall score near threshold (${opp.score} vs 80)`);
    }
    
    return reasons.join(', ');
  };

  const analyzeSymbol = async (symbol, quote, options, marketData) => {
    const allOpportunities = [];
    const currentPrice = quote.last;
    
    if (!options || options.length === 0) return allOpportunities;
    
    const expirations = {};
    options.forEach(option => {
      if (!expirations[option.expiration]) {
        expirations[option.expiration] = [];
      }
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

  const scanOpportunities = async () => {
    setLoading(true);
    setScanning(true);
    setScanProgress(0);
    setScanStatus('Initializing scan...');
    
    try {
      const allOpportunities = [];
      
      for (let i = 0; i < symbolsToScan.length; i++) {
        const symbol = symbolsToScan[i];
        setScanStatus(`Analyzing ${symbol} (${i+1}/${symbolsToScan.length})...`);
        
        try {
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          const quoteResponse = await fetch(`${backendUrl}/market/quote/${symbol}`);
          if (!quoteResponse.ok) {
            console.log(`Skipping ${symbol}: Quote error ${quoteResponse.status}`);
            continue;
          }
          
          const quoteData = await quoteResponse.json();
          if (!quoteData.success || !quoteData.last) {
            console.log(`Skipping ${symbol}: No valid quote data`);
            continue;
          }
          
          await new Promise(resolve => setTimeout(resolve, 1000));
          const optionsResponse = await fetch(`${backendUrl}/options/chain/${symbol}`);
          if (!optionsResponse.ok) {
            console.log(`Skipping ${symbol}: Options error ${optionsResponse.status}`);
            continue;
          }
          
          const optionsData = await optionsResponse.json();
          if (!optionsData.success || !optionsData.options) {
            console.log(`Skipping ${symbol}: No options data`);
            continue;
          }
          
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
        
        setScanProgress((i + 1) / symbolsToScan.length * 100);
      }
      
      const { highProb, mediumProb, lowProb, nearMiss } = categorizeOpportunities(allOpportunities);
      
      const sortByScore = (a, b) => b.score - a.score;
      setOpportunities(highProb.sort(sortByScore));
      setMediumProbOpportunities(mediumProb.sort(sortByScore));
      setLowProbOpportunities(lowProb.sort(sortByScore));
      setNearMissOpportunities(nearMiss.sort(sortByScore));
      
      setScanStatus(`Found ${allOpportunities.length} total opportunities`);
      
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
    const highProb = [
      createOpportunity('SPY', 'Iron Condor', 'credit-spread', '2025-12-19', 5,
        2.45, 7.55, 2.45, 82, 0.75,
        { shortCall: 485, longCall: 490, shortPut: 465, longPut: 460 },
        { delta: 0.05, theta: 0.28, vega: -0.12 },
        'High IV (75th percentile), low Delta exposure',
        681.76
      ),
      createOpportunity('AAPL', 'Bull Call Spread', 'debit-spread', '2025-12-26', 12,
        1.85, 1.85, 3.15, 78, 0.42,
        { longCall: 195, shortCall: 200 },
        { delta: 0.48, theta: -0.07, vega: 0.14 },
        'Low IV, positive Delta, earnings catalyst',
        195.42
      )
    ];
    
    const mediumProb = [
      createOpportunity('NVDA', 'Bear Put Spread', 'debit-spread', '2025-12-19', 5,
        2.10, 2.10, 2.90, 65, 0.55,
        { longPut: 525, shortPut: 520 },
        { delta: -0.40, theta: -0.15, vega: 0.10 },
        'Moderate IV, technical resistance',
        530.25
      ),
      createOpportunity('QQQ', 'Credit Spread', 'credit-spread', '2025-12-26', 12,
        1.50, 3.50, 1.50, 68, 0.60,
        { shortCall: 435, longCall: 440 },
        { delta: 0.25, theta: 0.18, vega: -0.08 },
        'High IV but narrow spread',
        432.15
      )
    ];
    
    const lowProb = [
      createOpportunity('TSLA', 'Long Straddle', 'volatility', '2025-12-19', 5,
        15.50, 15.50, 'Unlimited', 58, 0.35,
        { callStrike: 250, putStrike: 250 },
        { delta: 0, theta: -0.40, vega: 0.30 },
        'Low IV, expecting earnings move',
        248.75
      ),
      createOpportunity('META', 'Naked Put', 'theta-decay', '2025-12-12', 3,
        3.25, 'Unlimited', 3.25, 52, 0.68,
        { strike: 475, type: 'put' },
        { delta: -0.25, theta: -0.35, vega: 0.06 },
        'High premium but unlimited risk',
        480.50
      )
    ];
    
    const nearMiss = [
      createOpportunity('AMD', 'Iron Condor', 'credit-spread', '2025-12-19', 5,
        1.85, 8.15, 1.85, 69, 0.72,
        { shortCall: 155, longCall: 160, shortPut: 140, longPut: 135 },
        { delta: 0.04, theta: 0.22, vega: -0.11 },
        'Probability just below 70% threshold',
        147.80
      ),
      createOpportunity('MSFT', 'Bull Call Spread', 'debit-spread', '2025-12-26', 12,
        2.40, 2.40, 3.60, 71, 0.38,
        { longCall: 420, shortCall: 425 },
        { delta: 0.42, theta: -0.09, vega: 0.12 },
        'Reward/Risk ratio 1.8:1 (below 2:1 threshold)',
        418.90
      )
    ];
    
    setOpportunities(highProb);
    setMediumProbOpportunities(mediumProb);
    setLowProbOpportunities(lowProb);
    setNearMissOpportunities(nearMiss);
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
    
    let distanceInfo = '';
    if (opp.currentPrice && opp.setup) {
      if (opp.strategy.includes('Iron Condor')) {
        const putDistance = ((opp.currentPrice - opp.setup.shortPut) / opp.currentPrice * 100).toFixed(1);
        const callDistance = ((opp.setup.shortCall - opp.currentPrice) / opp.currentPrice * 100).toFixed(1);
        distanceInfo = `Puts: ${putDistance}% OTM • Calls: ${callDistance}% OTM`;
      } else if (opp.strategy.includes('Bull')) {
        const longDistance = ((opp.setup.longCall - opp.currentPrice) / opp.currentPrice * 100).toFixed(1);
        const shortDistance = ((opp.setup.shortCall - opp.currentPrice) / opp.currentPrice * 100).toFixed(1);
        distanceInfo = `Long: ${longDistance}% ITM • Short: ${shortDistance}% OTM`;
      } else if (opp.strategy.includes('Bear')) {
        const longDistance = ((opp.currentPrice - opp.setup.longPut) / opp.currentPrice * 100).toFixed(1);
        const shortDistance = ((opp.currentPrice - opp.setup.shortPut) / opp.currentPrice * 100).toFixed(1);
        distanceInfo = `Long: ${longDistance}% ITM • Short: ${shortDistance}% OTM`;
      }
    }
    
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
        
        {activeTab === 'near-miss' && opp.nearMissReason && (
          <View style={styles.nearMissBadge}>
            <Text style={styles.nearMissText}>⚠️ {opp.nearMissReason}</Text>
          </View>
        )}
        
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
          
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Max Profit</Text>
              <Text style={[styles.detailValue, styles.profitText]}>
                ${opp.maxProfit}
              </Text>
            </View>
            
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Max Loss</Text>
              <Text style={[styles.detailValue, styles.lossText]}>
                ${opp.maxLoss}
              </Text>
            </View>
            
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Days</Text>
              <Text style={styles.detailValue}>{opp.daysToExpiry}</Text>
            </View>
          </View>
          
          {opp.currentPrice && (
            <View style={styles.currentPriceContainer}>
              <Text style={styles.currentPriceLabel}>Current: ${opp.currentPrice.toFixed(2)}</Text>
              {distanceInfo ? (
                <Text style={styles.distanceLabel}>{distanceInfo}</Text>
              ) : null}
            </View>
          )}
        </View>
        
        {opp.reason && (
          <Text style={styles.reasonText}>{opp.reason}</Text>
        )}
      </TouchableOpacity>
    );
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

  const renderScanningOverlay = () => {
    if (!scanning) return null;
    
    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={scanning}
      >
        <View style={styles.scanOverlay}>
          <View style={styles.scanModal}>
            <ActivityIndicator size="large" color="#667eea" />
            <Text style={styles.scanTitle}>Scanning for Opportunities</Text>
            <Text style={styles.scanStatus}>{scanStatus}</Text>
            
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${scanProgress}%` }
                ]} 
              />
            </View>
            
            <Text style={styles.scanProgress}>{Math.round(scanProgress)}%</Text>
            
            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={() => setScanning(false)}
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
              Analyzes {symbolsToScan.length} symbols across probability spectrum
            </Text>
          </>
        )}
      </TouchableOpacity>
      
      {renderProbabilityTabs()}
      
      <View style={styles.categoryInfo}>
        <Text style={styles.categoryTitle}>{getTabTitle()}</Text>
        <Text style={styles.categoryDescription}>{getTabDescription()}</Text>
      </View>
      
      <View style={styles.opportunitiesSection}>
        {getCurrentOpportunities().length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>
              {activeTab === 'high' ? '📊' : 
               activeTab === 'medium' ? '📈' : 
               activeTab === 'low' ? '⚡' : '⚠️'}
            </Text>
            <Text style={styles.emptyStateTitle}>
              {activeTab === 'high' ? 'No high probability opportunities' :
               activeTab === 'medium' ? 'No medium probability opportunities' :
               activeTab === 'low' ? 'No low probability opportunities' :
               'No near miss opportunities'}
            </Text>
            <Text style={styles.emptyStateText}>
              {activeTab === 'high' ? 'Click scan to find high-probability trades' :
               activeTab === 'medium' ? 'Medium probability trades require specific conditions' :
               activeTab === 'low' ? 'Low probability trades are higher risk/reward' :
               'Near miss trades missed criteria by small margin'}
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.opportunitiesList}>
            {getCurrentOpportunities().map(renderOpportunityCard)}
          </ScrollView>
        )}
      </View>
      
      <View style={styles.statsFooter}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{opportunities.length}</Text>
          <Text style={styles.statLabel}>High Prob</Text>
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
      
      {renderOpportunityModal()}
      {renderScanningOverlay()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#667eea',
    padding: 20,
    paddingTop: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
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
  scanButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  scanButtonSubtext: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  tabsContainer: {
    marginHorizontal: 15,
    marginBottom: 10,
  },
  tabsInner: {
    flexDirection: 'row',
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    marginRight: 10,
  },
  activeTab: {
    borderBottomWidth: 3,
  },
  tabContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  activeTabLabel: {
    fontWeight: 'bold',
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  categoryInfo: {
    paddingHorizontal: 15,
    marginBottom: 10,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  categoryDescription: {
    fontSize: 14,
    color: '#666',
  },
  currentPriceContainer: {
    backgroundColor: '#f0f9ff',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  currentPriceLabel: {
    fontSize: 14,
    color: '#0369a1',
    fontWeight: '600',
    marginBottom: 4,
  },
  distanceLabel: {
    fontSize: 12,
    color: '#666',
  },
  nearMissBadge: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  nearMissText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '500',
  },
  statsFooter: {
    flexDirection: 'row',
    backgroundColor: 'white',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  opportunitiesSection: {
    flex: 1,
    marginHorizontal: 15,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 15,
    opacity: 0.3,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  opportunitiesList: {
    flex: 1,
  },
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
  opportunityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  symbolContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  symbolText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 10,
  },
  strategyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  strategyText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scoreContainer: {
    alignItems: 'center',
  },
  scoreLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 5,
  },
  scoreCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#667eea',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  opportunityDetails: {
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailItem: {
    flex: 1,
    marginRight: 10,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 5,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  probabilityBar: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    marginBottom: 5,
    overflow: 'hidden',
  },
  probabilityFill: {
    height: '100%',
    borderRadius: 3,
  },
  profitText: {
    color: '#10B981',
  },
  lossText: {
    color: '#EF4444',
  },
  reasonText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  tradeDetailsContainer: {
    flex: 1,
    padding: 15,
  },
  tradeDetailsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  currentPriceBanner: {
    backgroundColor: '#667eea',
    padding: 15,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  currentPriceLabel: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  currentPriceValue: {
    fontSize: 24,
    color: 'white',
    fontWeight: 'bold',
  },
  sectionContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  tradeSummary: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
  },
  tradeSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tradeSummaryLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  tradeSummaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  bullishText: {
    color: '#10B981',
  },
  bearishText: {
    color: '#EF4444',
  },
  neutralText: {
    color: '#6B7280',
  },
  optionLeg: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  legAction: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },
  buyAction: {
    backgroundColor: '#10B98120',
  },
  sellAction: {
    backgroundColor: '#EF444420',
  },
  legActionText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  legType: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 10,
  },
  callType: {
    backgroundColor: '#3B82F620',
  },
  putType: {
    backgroundColor: '#8B5CF620',
  },
  legTypeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  legStrikeContainer: {
    flex: 1,
    marginRight: 10,
  },
  legStrike: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  legDistance: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  legPremium: {
    fontSize: 14,
    fontWeight: '600',
  },
  creditText: {
    color: '#10B981',
  },
  debitText: {
    color: '#EF4444',
  },
  instructionLine: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    lineHeight: 20,
  },
  riskRewardGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  riskRewardItem: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  riskRewardLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  riskRewardValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  profitValue: {
    color: '#10B981',
  },
  lossValue: {
    color: '#EF4444',
  },
  riskRewardDesc: {
    fontSize: 12,
    color: '#666',
  },
  breakevenContainer: {
    backgroundColor: '#f0f9ff',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  breakevenTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0369a1',
    marginBottom: 10,
  },
  breakevenText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  greekImpact: {
    marginBottom: 15,
  },
  greekImpactLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  greekImpactText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  managementRule: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  ruleIcon: {
    fontSize: 20,
    marginRight: 10,
    marginTop: 2,
  },
  ruleContent: {
    flex: 1,
  },
  ruleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ruleText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  brokerText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
    lineHeight: 20,
  },
  disclaimerContainer: {
    backgroundColor: '#FEF3C7',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  disclaimerText: {
    fontSize: 12,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 15,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  modalCloseButton: {
    padding: 5,
  },
  modalClose: {
    fontSize: 24,
    color: '#999',
  },
  modalTabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTab: {
    flex: 1,
    padding: 15,
    alignItems: 'center',
  },
  activeModalTab: {
    borderBottomWidth: 3,
    borderBottomColor: '#667eea',
  },
  modalTabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeModalTabText: {
    color: '#667eea',
    fontWeight: 'bold',
  },
  modalBody: {
    flex: 1,
    minHeight: 400,
  },
  modalSection: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  modalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
  },
  modalItem: {
    minWidth: '30%',
  },
  modalLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  modalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  reasonModalText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  modalButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  scanOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanModal: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 30,
    width: '80%',
    alignItems: 'center',
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
  },
  scanStatus: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#667eea',
    borderRadius: 4,
  },
  scanProgress: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  cancelButton: {
    padding: 10,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
  },
});

export default SmartOpportunities;
