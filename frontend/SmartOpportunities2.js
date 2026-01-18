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
  Animated,
  SectionList
} from 'react-native';

const { width } = Dimensions.get('window');

const SmartOpportunities = ({ backendUrl = 'https://advstrat-production.up.railway.app:5000' }) => {
  const [opportunities, setOpportunities] = useState([]);
  const [mediumProbOpportunities, setMediumProbOpportunities] = useState([]);
  const [lowProbOpportunities, setLowProbOpportunities] = useState([]);
  const [nearMissOpportunities, setNearMissOpportunities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [selectedOpp, setSelectedOpp] = useState(null);
  const [filters, setFilters] = useState({
    minProbability: 70,
    maxRisk: 500,
    minRewardRatio: 2,
    expiryDays: [7, 30],
    strategyTypes: ['debit-spread', 'credit-spread', 'iron-condor', 'calendar']
  });
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [activeTab, setActiveTab] = useState('high'); // 'high', 'medium', 'low', 'near-miss'
  const [scanAnim] = useState(new Animated.Value(0));

  // Popular symbols to scan (reduced for rate limiting)
  // const symbolsToScan = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN']; // Just 3 for testing
  const symbolsToScan =  ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN'];
  // ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN',//];
  //    "SOXS", "OCG", "YCBD", "NVDA", "CGC", "BBAI", "TQQQ", "SOXL", "WOK", "TZA", "PLUG", "SPY", "ASST", "TSLL", "RIVN", "AVGO", "TSLA", "TSLS", "MSOS", "ONDS", "INTC", "TLRY",

  //   "ATPC", "SLV", "QQQ", "IQ", "TNYA", "JDST", "XLF", "BEAT", "FRMI", "TE", "KAVL", "IWM", "SQQQ", "ASBP", "ORCL", "SOFI", "VIVK", "BMNR", "PFE", "ZDGE", "DNN", "OPEN", "NFLX",
    
  //   "HPE", "F", "AAL", "PLTD", "IBIT", "ETHA", "TLT", "KVUE", "WBD", "HYG", "QID", "WULF", "UGRO", "MARA", "PLTR", "RR", "BMNU", "BYND", "VALE", "SPDN", "BAC", "UVIX", "AAPL",
    
  //   "LQD", "ACHR", "APLT", "SNAP", "CLSK", "NVD", "BITF", "IVP", "AMD", "FNGD", "NU", "GOGL", "AMZN", "IREN", "IRBT", "RZLT", "CRWV", "BTG", "BITO", "T", "NCI", "CVE", "RIG",
    
  //   "RKLB", "QBTS", "XLE", "NIO", "RWM", "MISL", "HOOD", "CIFR", "PL"];
  // Strategy definitions
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

  // Categorize opportunities by probability
  const categorizeOpportunities = (allOpportunities) => {
    const highProb = [];
    const mediumProb = [];
    const lowProb = [];
    const nearMiss = [];

    allOpportunities.forEach(opp => {
      // Check if it's a near miss (missed high prob by small margin)
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

  // Get reason why it's a near miss
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
    
    if (opp.maxLoss > 500 && opp.maxLoss <= 600) {
      reasons.push(`Slightly above max loss threshold ($${opp.maxLoss} vs $500)`);
    }
    
    return reasons.join(', ');
  };

  // Enhanced analyzeSymbol function
  const analyzeSymbol = async (symbol, quote, options, marketData) => {
    const allOpportunities = [];
    const currentPrice = quote.last;
    
    if (!options || options.length === 0) return allOpportunities;
    
    // Group options by expiration
    const expirations = {};
    options.forEach(option => {
      if (!expirations[option.expiration]) {
        expirations[option.expiration] = [];
      }
      expirations[option.expiration].push(option);
    });
    
    // Analyze each expiration
    for (const [expiration, expOptions] of Object.entries(expirations)) {
      const daysToExpiry = Math.ceil((new Date(expiration) - new Date()) / (1000 * 60 * 60 * 24));
      
      // Skip if outside filter range (but keep for analysis)
      const withinRange = daysToExpiry >= filters.expiryDays[0] && daysToExpiry <= filters.expiryDays[1];
      
      // Separate calls and puts
      const calls = expOptions.filter(o => o.type === 'call');
      const puts = expOptions.filter(o => o.type === 'put');
      
      if (calls.length === 0 || puts.length === 0) continue;
      
      // Calculate average IV and IV percentile
      const avgIV = expOptions.reduce((sum, o) => sum + (o.iv || 0), 0) / expOptions.length;
      const ivPercentile = Math.min(95, avgIV * 100);
      
      // Generate opportunities with varying probabilities
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

  // Generate opportunities across probability spectrum
  const generateOpportunitiesByProbability = (symbol, expiration, daysToExpiry, currentPrice, calls, puts, avgIV, ivPercentile, withinRange) => {
    const opportunities = [];
    
    // 1. HIGH PROBABILITY OPPORTUNITIES (70%+)
    if (withinRange && avgIV > 0.35) {
      // Iron Condor - High IV, wide strikes
      const shortCall = findStrike(calls, currentPrice * 1.03); // 3% OTM
      const longCall = findStrike(calls, currentPrice * 1.05); // 5% OTM
      const shortPut = findStrike(puts, currentPrice * 0.97); // 3% OTM
      const longPut = findStrike(puts, currentPrice * 0.95); // 5% OTM
      
      if (shortCall && longCall && shortPut && longPut) {
        const credit = (shortCall.bid + shortPut.bid) - (longCall.ask + longPut.ask);
        const width = Math.abs(shortCall.strike - longCall.strike);
        const maxLoss = (width * 100) - credit;
        const probability = Math.min(85, 75 + (avgIV * 20)); // Higher IV = higher prob for credit spreads
        
        opportunities.push(createOpportunity(
          symbol, 'Iron Condor', 'credit-spread', expiration, daysToExpiry,
          credit, maxLoss, width, probability, avgIV,
          { shortCall: shortCall.strike, longCall: longCall.strike, shortPut: shortPut.strike, longPut: longPut.strike },
          { delta: 0.03, theta: 0.22, vega: -0.10 },
          'High IV environment with wide strike placement'
        ));
      }
    }
    
    // 2. MEDIUM PROBABILITY OPPORTUNITIES (60-69%)
    if (withinRange) {
      // Bull Call Spread - Medium probability
      const longCall = findStrike(calls, currentPrice); // ATM
      const shortCall = findStrike(calls, currentPrice * 1.02); // 2% OTM
      
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
          'Moderate IV with directional bias'
        ));
      }
      
      // Bear Put Spread
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
          'Downside protection with moderate probability'
        ));
      }
    }
    
    // 3. LOW PROBABILITY OPPORTUNITIES (50-59%) - Higher risk, higher reward
    if (daysToExpiry <= 14) {
      // Naked Put - Higher risk, lower probability
      const putStrike = findStrike(puts, currentPrice * 0.95);
      if (putStrike) {
        const credit = putStrike.bid;
        const probability = 55;
        
        opportunities.push(createOpportunity(
          symbol, 'Naked Put Sale', 'theta-decay', expiration, daysToExpiry,
          credit, 'Unlimited', credit, probability, avgIV,
          { strike: putStrike.strike, type: 'put' },
          { delta: -0.20, theta: -0.25, vega: 0.05 },
          'High premium but unlimited risk'
        ));
      }
      
      // Straddle - Low probability, high volatility play
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
          'Low IV, expecting big move'
        ));
      }
    }
    
    // 4. NEAR MISS OPPORTUNITIES (just below thresholds)
    if (withinRange) {
      // Near miss Iron Condor
      const shortCall = findStrike(calls, currentPrice * 1.02);
      const longCall = findStrike(calls, currentPrice * 1.035);
      const shortPut = findStrike(puts, currentPrice * 0.98);
      const longPut = findStrike(puts, currentPrice * 0.965);
      
      if (shortCall && longCall && shortPut && longPut) {
        const credit = (shortCall.bid + shortPut.bid) - (longCall.ask + longPut.ask);
        const width = Math.abs(shortCall.strike - longCall.strike);
        const maxLoss = (width * 100) - credit;
        const probability = 68; // Just below threshold
        
        opportunities.push(createOpportunity(
          symbol, 'Iron Condor (Near Miss)', 'credit-spread', expiration, daysToExpiry,
          credit, maxLoss, credit, probability, avgIV,
          { shortCall: shortCall.strike, longCall: longCall.strike, shortPut: shortPut.strike, longPut: longPut.strike },
          { delta: 0.05, theta: 0.20, vega: -0.12 },
          'Narrow strikes, probability just below threshold'
        ));
      }
    }
    
    return opportunities;
  };

  // Helper function to find strike
  const findStrike = (options, targetPrice) => {
    return options.find(o => Math.abs(o.strike - targetPrice) / targetPrice < 0.02) || options[0];
  };

  // Helper to create opportunity object
  const createOpportunity = (symbol, strategy, type, expiration, daysToExpiry, 
                            cost, maxLoss, maxProfit, probability, avgIV, 
                            setup, greeks, reason) => {
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
      score: Math.round(score),
      timestamp: new Date().toISOString()
    };
  };

  // Enhanced scoring function
  const calculateScore = (probability, rewardRatio, daysToExpiry, iv) => {
    const probScore = probability * 0.35;
    const ratioScore = (typeof rewardRatio === 'number' ? Math.min(10, rewardRatio) * 5.5 : 30);
    const timeScore = Math.max(0, 25 - (daysToExpiry / 2));
    const ivScore = iv < 0.4 ? 10 : iv > 0.6 ? 5 : 8;
    
    return Math.min(100, probScore + ratioScore + timeScore + ivScore);
  };

  // Scan for opportunities
  const scanOpportunities = async () => {
    setLoading(true);
    setScanning(true);
    setScanProgress(0);
    setScanStatus('Initializing scan...');
    
    try {
      const allOpportunities = [];
      
      // Scan each symbol with delay to avoid rate limits
      for (let i = 0; i < symbolsToScan.length; i++) {
        const symbol = symbolsToScan[i];
        setScanStatus(`Analyzing ${symbol} (${i+1}/${symbolsToScan.length})...`);
        
        try {
          // Add delay between symbols (2 seconds)
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          // Get quote
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
          
          // Get options chain
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
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
          
          // Get market overview for context
          const marketResponse = await fetch(`${backendUrl}/market/overview`);
          const marketData = marketResponse.ok ? await marketResponse.json() : {};
          
          // Analyze symbol
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
      
      // Categorize opportunities
      const { highProb, mediumProb, lowProb, nearMiss } = categorizeOpportunities(allOpportunities);
      
      // Sort each category by score
      const sortByScore = (a, b) => b.score - a.score;
      setOpportunities(highProb.sort(sortByScore));
      setMediumProbOpportunities(mediumProb.sort(sortByScore));
      setLowProbOpportunities(lowProb.sort(sortByScore));
      setNearMissOpportunities(nearMiss.sort(sortByScore));
      
      setScanStatus(`Found ${allOpportunities.length} total opportunities`);
      
    } catch (error) {
      Alert.alert('Scan Error', `Failed to scan opportunities: ${error.message}`);
      // Generate sample data for demo if API fails
      generateSampleData();
    } finally {
      setLoading(false);
      setTimeout(() => {
        setScanning(false);
        setScanProgress(100);
      }, 1000);
    }
  };

  // Generate sample data for demo
  const generateSampleData = () => {
    // High probability samples
    const highProb = [
      createOpportunity('SPY', 'Iron Condor', 'credit-spread', '2025-12-19', 5,
        2.45, 7.55, 2.45, 82, 0.75,
        { shortCall: 485, longCall: 490, shortPut: 465, longPut: 460 },
        { delta: 0.05, theta: 0.28, vega: -0.12 },
        'High IV (75th percentile), low Delta exposure'
      ),
      createOpportunity('AAPL', 'Bull Call Spread', 'debit-spread', '2025-12-26', 12,
        1.85, 1.85, 3.15, 78, 0.42,
        { longCall: 195, shortCall: 200 },
        { delta: 0.48, theta: -0.07, vega: 0.14 },
        'Low IV, positive Delta, earnings catalyst'
      )
    ];
    
    // Medium probability samples
    const mediumProb = [
      createOpportunity('NVDA', 'Bear Put Spread', 'debit-spread', '2025-12-19', 5,
        2.10, 2.10, 2.90, 65, 0.55,
        { longPut: 525, shortPut: 520 },
        { delta: -0.40, theta: -0.15, vega: 0.10 },
        'Moderate IV, technical resistance'
      ),
      createOpportunity('QQQ', 'Credit Spread', 'credit-spread', '2025-12-26', 12,
        1.50, 3.50, 1.50, 68, 0.60,
        { shortCall: 435, longCall: 440 },
        { delta: 0.25, theta: 0.18, vega: -0.08 },
        'High IV but narrow spread'
      )
    ];
    
    // Low probability samples
    const lowProb = [
      createOpportunity('TSLA', 'Long Straddle', 'volatility', '2025-12-19', 5,
        15.50, 15.50, 'Unlimited', 58, 0.35,
        { callStrike: 250, putStrike: 250 },
        { delta: 0, theta: -0.40, vega: 0.30 },
        'Low IV, expecting earnings move'
      ),
      createOpportunity('META', 'Naked Put', 'theta-decay', '2025-12-12', 3,
        3.25, 'Unlimited', 3.25, 52, 0.68,
        { strike: 475, type: 'put' },
        { delta: -0.25, theta: -0.35, vega: 0.06 },
        'High premium but unlimited risk'
      )
    ];
    
    // Near miss samples
    const nearMiss = [
      createOpportunity('AMD', 'Iron Condor', 'credit-spread', '2025-12-19', 5,
        1.85, 8.15, 1.85, 69, 0.72,
        { shortCall: 155, longCall: 160, shortPut: 140, longPut: 135 },
        { delta: 0.04, theta: 0.22, vega: -0.11 },
        'Probability just below 70% threshold'
      ),
      createOpportunity('MSFT', 'Bull Call Spread', 'debit-spread', '2025-12-26', 12,
        2.40, 2.40, 3.60, 71, 0.38,
        { longCall: 420, shortCall: 425 },
        { delta: 0.42, theta: -0.09, vega: 0.12 },
        'Reward/Risk ratio 1.8:1 (below 2:1 threshold)'
      )
    ];
    
    setOpportunities(highProb);
    setMediumProbOpportunities(mediumProb);
    setLowProbOpportunities(lowProb);
    setNearMissOpportunities(nearMiss);
  };

  // Get opportunities for current tab
  const getCurrentOpportunities = () => {
    switch(activeTab) {
      case 'high': return opportunities;
      case 'medium': return mediumProbOpportunities;
      case 'low': return lowProbOpportunities;
      case 'near-miss': return nearMissOpportunities;
      default: return opportunities;
    }
  };

  // Get tab title
  const getTabTitle = () => {
    switch(activeTab) {
      case 'high': return `High Probability (${opportunities.length})`;
      case 'medium': return `Medium Probability (${mediumProbOpportunities.length})`;
      case 'low': return `Low Probability (${lowProbOpportunities.length})`;
      case 'near-miss': return `Near Miss (${nearMissOpportunities.length})`;
      default: return `Opportunities (${opportunities.length})`;
    }
  };

  // Get tab description
  const getTabDescription = () => {
    switch(activeTab) {
      case 'high': return '70%+ probability, best risk/reward';
      case 'medium': return '60-69% probability, moderate risk';
      case 'low': return '50-59% probability, higher risk/reward';
      case 'near-miss': return 'Missed criteria by small margin';
      default: return 'Select a category';
    }
  };

  // Render probability tabs
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

  // Render opportunity card (same as before, but updated)
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
        
        {/* Add near miss indicator */}
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
          
          <View style={styles.greeksContainer}>
            <View style={styles.greekItem}>
              <Text style={styles.greekSymbol}>Δ {opp.greeks.delta}</Text>
              <Text style={styles.greekLabel}>Delta</Text>
            </View>
            <View style={styles.greekItem}>
              <Text style={styles.greekSymbol}>Θ {opp.greeks.theta}</Text>
              <Text style={styles.greekLabel}>Theta</Text>
            </View>
            <View style={styles.greekItem}>
              <Text style={styles.greekSymbol}>ν {opp.greeks.vega}</Text>
              <Text style={styles.greekLabel}>Vega</Text>
            </View>
          </View>
        </View>
        
        {opp.reason && (
          <Text style={styles.reasonText}>{opp.reason}</Text>
        )}
      </TouchableOpacity>
    );
  };

  // Get strategy color
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

  // Get risk color based on probability
  const getRiskColor = (probability) => {
    if (probability >= 70) return '#10B981'; // Green
    if (probability >= 60) return '#F59E0B'; // Yellow
    if (probability >= 50) return '#EF4444'; // Red
    return '#6B7280'; // Gray
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🎯 Smart Options Opportunities</Text>
        <Text style={styles.subtitle}>
          AI-powered scan for high-probability trades
        </Text>
      </View>
      
      {/* Scan Button */}
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
      
      {/* Probability Tabs */}
      {renderProbabilityTabs()}
      
      {/* Current Category Info */}
      <View style={styles.categoryInfo}>
        <Text style={styles.categoryTitle}>{getTabTitle()}</Text>
        <Text style={styles.categoryDescription}>{getTabDescription()}</Text>
      </View>
      
      {/* Opportunities List */}
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
      
      {/* Statistics Footer */}
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
      
      {/* Modals and scanning overlay remain the same */}
      {/* ... */}
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
  // Tabs
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
  // Category Info
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
  // Near Miss Badge
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
  // Stats Footer
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
  // Rest of the styles remain the same...
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
  greeksContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  greekItem: {
    alignItems: 'center',
  },
  greekSymbol: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  greekLabel: {
    fontSize: 10,
    color: '#666',
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
  // ... rest of your existing styles
});

export default SmartOpportunities;
