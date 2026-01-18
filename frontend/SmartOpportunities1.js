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

const SmartOpportunities = ({ backendUrl = 'https://advstrat-production.up.railway.app:5000' }) => {
  const [opportunities, setOpportunities] = useState([]);
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
  const [scanAnim] = useState(new Animated.Value(0));

  // Popular symbols to scan
  const symbolsToScan = // Working stocks from your logs
  // [
  //   'SPY', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'QQQ',
  
  // // Top 50 stocks with verified symbols
  // 'AMZN', 'GOOGL', 'META', 'AMD', 'AVGO', 'BRK.B', 'JPM',  // BRK.B not BRK-B
  
  // 'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'CVX',
  // 'XOM', 'ABBV', 'PFE', 'LLY', 'BAC', 'KO', 'PEP',
  // 'MRK', 'TMO', 'COST', 'DHR', 'MCD', 'CSCO', 'ACN',
  // 'ABT', 'ADBE', 'CRM', 'LIN', 'NFLX', 'DIS', 'WFC',
  // 'CMCSA', 'PM', 'TXN', 'NKE', 'ORCL', 'UPS', 'RTX',
  // 'SCHW', 'AMT', 'PLD', 'NOW', 'GS', 'BLK', 'LOW'
  // ];
  ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', "SOXS", "OCG", "YCBD", "NVDA", "CGC", "BBAI", "TQQQ", "SOXL", "WOK", "TZA", "PLUG", "SPY", "ASST", "TSLL", "RIVN", "AVGO", "TSLA", "TSLS", "MSOS", "ONDS", "INTC", "TLRY",

    "ATPC", "SLV", "QQQ", "IQ", "TNYA", "JDST", "XLF", "BEAT", "FRMI", "TE", "KAVL", "IWM", "SQQQ", "ASBP", "ORCL", "SOFI", "VIVK", "BMNR", "PFE", "ZDGE", "DNN", "OPEN", "NFLX",
    
    "HPE", "F", "AAL", "PLTD", "IBIT", "ETHA", "TLT", "KVUE", "WBD", "HYG", "QID", "WULF", "UGRO", "MARA", "PLTR", "RR", "BMNU", "BYND", "VALE", "SPDN", "BAC", "UVIX", "AAPL",
    
    "LQD", "ACHR", "APLT", "SNAP", "CLSK", "NVD", "BITF", "IVP", "AMD", "FNGD", "NU", "GOGL", "AMZN", "IREN", "IRBT", "RZLT", "CRWV", "BTG", "BITO", "T", "NCI", "CVE", "RIG",
    
    "RKLB", "QBTS", "XLE", "NIO", "RWM", "MISL", "HOOD", "CIFR", "PL"];
  // ['SPY', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'QQQ',
  //   'AMZN', 'GOOGL', 'META', 'AMD', 'AVGO', 'BRK-B', 'JPM',
  //   'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'CVX',
  //   'XOM', 'ABBV', 'PFE', 'LLY', 'BAC', 'KO', 'PEP',
  //   'MRK', 'TMO', 'COST', 'DHR', 'MCD', 'CSCO', 'ACN',
  //   'ABT', 'ADBE', 'CRM', 'LIN', 'NFLX', 'DIS', 'WFC',
  //   'CMCSA', 'PM', 'TXN', 'NKE', 'ORCL', 'UPS', 'RTX',
  //   'SCHW', 'AMT', 'PLD', 'NOW', 'GS', 'BLK', 'LOW'
  //  ];
  // ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'AMZN', 'META', 'GOOGL'];

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

  // Scan for opportunities
  const scanOpportunities = async () => {
    setLoading(true);
    setScanning(true);
    setScanProgress(0);
    setScanStatus('Initializing scan...');
    
    const foundOpportunities = [];
    
    try {
      // Step 1: Get market overview
      setScanStatus('Fetching market data...');
      const marketResponse = await fetch(`${backendUrl}/market/overview`);
      const marketData = await marketResponse.json();
      setScanProgress(10);
      
      // Step 2: Scan each symbol
      for (let i = 0; i < symbolsToScan.length; i++) {
        const symbol = symbolsToScan[i];
        setScanStatus(`Analyzing ${symbol}...`);
        
        try {
          // Get quote
          const quoteResponse = await fetch(`${backendUrl}/market/quote/${symbol}`);
          const quoteData = await quoteResponse.json();
          
          if (!quoteData.success) continue;
          
          // Get options chain
          const optionsResponse = await fetch(`${backendUrl}/options/chain/${symbol}`);
          const optionsData = await optionsResponse.json();
          
          if (!optionsData.success || !optionsData.options) continue;
          
          // Analyze for opportunities
          const symbolOpportunities = await analyzeSymbol(
            symbol, 
            quoteData, 
            optionsData.options,
            marketData
          );
          
          foundOpportunities.push(...symbolOpportunities);
          
        } catch (symbolError) {
          console.error(`Error scanning ${symbol}:`, symbolError);
        }
        
        setScanProgress(10 + (i / symbolsToScan.length) * 80);
      }
      
      // Step 3: Sort and filter opportunities
      setScanStatus('Processing results...');
      const filteredOpps = foundOpportunities
        .filter(opp => opp.probability >= filters.minProbability)
        .filter(opp => opp.maxLoss <= filters.maxRisk)
        .filter(opp => opp.rewardRiskRatio >= filters.minRewardRatio)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Top 10 opportunities
      
      setOpportunities(filteredOpps);
      setScanStatus(`Found ${filteredOpps.length} opportunities`);
      
      // Animate completion
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true
      }).start();
      
    } catch (error) {
      Alert.alert('Scan Error', `Failed to scan opportunities: ${error.message}`);
      // Fallback to mock data for demo
      setOpportunities(generateMockOpportunities());
    } finally {
      setLoading(false);
      setTimeout(() => {
        setScanning(false);
        setScanProgress(100);
      }, 1000);
    }
  };

  // Analyze a single symbol for opportunities
  const analyzeSymbol = async (symbol, quote, options, marketData) => {
    const opportunities = [];
    const currentPrice = quote.last;
    
    if (!options || options.length === 0) return opportunities;
    
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
      // Skip far expirations for quick trades
      const daysToExpiry = Math.ceil((new Date(expiration) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysToExpiry < filters.expiryDays[0] || daysToExpiry > filters.expiryDays[1]) continue;
      
      // Separate calls and puts
      const calls = expOptions.filter(o => o.type === 'call');
      const puts = expOptions.filter(o => o.type === 'put');
      
      if (calls.length === 0 || puts.length === 0) continue;
      
      // Find ATM options
      const atmCalls = calls.filter(c => 
        Math.abs(c.strike - currentPrice) / currentPrice < 0.05
      );
      const atmPuts = puts.filter(p => 
        Math.abs(p.strike - currentPrice) / currentPrice < 0.05
      );
      
      if (atmCalls.length === 0 || atmPuts.length === 0) continue;
      
      // Calculate average IV
      const avgIV = expOptions.reduce((sum, o) => sum + (o.iv || 0), 0) / expOptions.length;
      
      // Look for high IV opportunities (credit spreads)
      if (avgIV > 0.4) { // High IV (>40%)
        // Iron Condor opportunity
        const shortCall = atmCalls[Math.floor(atmCalls.length * 0.7)]; // 30% OTM
        const longCall = atmCalls[Math.floor(atmCalls.length * 0.8)]; // 20% OTM
        const shortPut = atmPuts[Math.floor(atmPuts.length * 0.3)]; // 30% OTM
        const longPut = atmPuts[Math.floor(atmPuts.length * 0.2)]; // 20% OTM
        
        if (shortCall && longCall && shortPut && longPut) {
          const credit = (shortCall.bid + shortPut.bid) - (longCall.ask + longPut.ask);
          const width = Math.abs(shortCall.strike - longCall.strike);
          const maxLoss = (width * 100) - credit;
          const probability = 85 - (avgIV * 100 * 0.5); // Higher IV = lower probability
          
          opportunities.push({
            id: `${symbol}-iron-condor-${expiration}`,
            symbol,
            strategy: 'Iron Condor',
            type: 'credit-spread',
            expiration,
            daysToExpiry,
            credit: credit.toFixed(2),
            maxLoss: maxLoss.toFixed(2),
            maxProfit: credit.toFixed(2),
            rewardRiskRatio: (credit / maxLoss).toFixed(2),
            probability: Math.min(90, Math.max(60, probability)),
            ivPercentile: Math.min(95, avgIV * 100),
            setup: {
              shortCall: shortCall.strike,
              longCall: longCall.strike,
              shortPut: shortPut.strike,
              longPut: longPut.strike
            },
            greeks: {
              delta: 0.05,
              theta: 0.25,
              vega: -0.15
            },
            score: calculateScore(probability, credit / maxLoss, daysToExpiry)
          });
        }
      }
      
      // Look for low IV opportunities (debit spreads)
      if (avgIV < 0.3) { // Low IV (<30%)
        // Bull Call Spread
        const longCall = atmCalls[Math.floor(atmCalls.length * 0.5)]; // ATM
        const shortCall = atmCalls[Math.floor(atmCalls.length * 0.6)]; // Slightly OTM
        
        if (longCall && shortCall) {
          const debit = longCall.ask - shortCall.bid;
          const width = Math.abs(shortCall.strike - longCall.strike);
          const maxProfit = (width * 100) - debit;
          const probability = 65 + ((0.3 - avgIV) * 100); // Lower IV = higher probability
          
          opportunities.push({
            id: `${symbol}-bull-call-${expiration}`,
            symbol,
            strategy: 'Bull Call Spread',
            type: 'debit-spread',
            expiration,
            daysToExpiry,
            debit: debit.toFixed(2),
            maxLoss: debit.toFixed(2),
            maxProfit: maxProfit.toFixed(2),
            rewardRiskRatio: (maxProfit / debit).toFixed(2),
            probability: Math.min(80, Math.max(50, probability)),
            ivPercentile: Math.max(5, avgIV * 100),
            setup: {
              longCall: longCall.strike,
              shortCall: shortCall.strike
            },
            greeks: {
              delta: 0.45,
              theta: -0.08,
              vega: 0.12
            },
            score: calculateScore(probability, maxProfit / debit, daysToExpiry)
          });
        }
      }
      
      // Theta decay opportunities (short options)
      if (daysToExpiry <= 7) {
        const otmCall = calls.find(c => 
          c.strike > currentPrice * 1.05 && 
          c.theta && 
          Math.abs(c.theta) > 0.15
        );
        
        const otmPut = puts.find(p => 
          p.strike < currentPrice * 0.95 && 
          p.theta && 
          Math.abs(p.theta) > 0.15
        );
        
        if (otmCall) {
          opportunities.push({
            id: `${symbol}-theta-call-${expiration}`,
            symbol,
            strategy: 'Theta Call Sale',
            type: 'theta-decay',
            expiration,
            daysToExpiry,
            credit: otmCall.bid.toFixed(2),
            maxLoss: 'Unlimited',
            maxProfit: otmCall.bid.toFixed(2),
            rewardRiskRatio: 'N/A',
            probability: 75,
            ivPercentile: (otmCall.iv * 100).toFixed(1),
            setup: {
              strike: otmCall.strike,
              type: 'call'
            },
            greeks: {
              delta: 0.25,
              theta: otmCall.theta || -0.18,
              vega: otmCall.vega || 0.08
            },
            score: calculateScore(75, 3, daysToExpiry)
          });
        }
        
        if (otmPut) {
          opportunities.push({
            id: `${symbol}-theta-put-${expiration}`,
            symbol,
            strategy: 'Theta Put Sale',
            type: 'theta-decay',
            expiration,
            daysToExpiry,
            credit: otmPut.bid.toFixed(2),
            maxLoss: 'Unlimited',
            maxProfit: otmPut.bid.toFixed(2),
            rewardRiskRatio: 'N/A',
            probability: 75,
            ivPercentile: (otmPut.iv * 100).toFixed(1),
            setup: {
              strike: otmPut.strike,
              type: 'put'
            },
            greeks: {
              delta: -0.25,
              theta: otmPut.theta || -0.18,
              vega: otmPut.vega || 0.08
            },
            score: calculateScore(75, 3, daysToExpiry)
          });
        }
      }
    }
    
    return opportunities;
  };

  // Calculate opportunity score (0-100)
  const calculateScore = (probability, rewardRatio, daysToExpiry) => {
    const probScore = probability * 0.4; // 40% weight
    const ratioScore = Math.min(10, rewardRatio) * 6; // 30% weight (max 60)
    const timeScore = Math.max(0, 30 - daysToExpiry); // 30% weight for shorter expiries
    
    return Math.min(100, probScore + ratioScore + timeScore);
  };

  // Mock data for demo
  const generateMockOpportunities = () => {
    return [
      {
        id: 'SPY-iron-condor-2024-01-19',
        symbol: 'SPY',
        strategy: 'Iron Condor',
        type: 'credit-spread',
        expiration: '2024-01-19',
        daysToExpiry: 5,
        credit: '2.45',
        maxLoss: '7.55',
        maxProfit: '2.45',
        rewardRiskRatio: '0.32',
        probability: 82,
        ivPercentile: 75,
        setup: {
          shortCall: 485,
          longCall: 490,
          shortPut: 465,
          longPut: 460
        },
        greeks: {
          delta: 0.05,
          theta: 0.28,
          vega: -0.12
        },
        score: 88,
        reason: 'High IV (75th percentile), low Delta exposure'
      },
      {
        id: 'AAPL-bull-call-2024-01-26',
        symbol: 'AAPL',
        strategy: 'Bull Call Spread',
        type: 'debit-spread',
        expiration: '2024-01-26',
        daysToExpiry: 12,
        debit: '1.85',
        maxLoss: '1.85',
        maxProfit: '3.15',
        rewardRiskRatio: '1.70',
        probability: 68,
        ivPercentile: 42,
        setup: {
          longCall: 195,
          shortCall: 200
        },
        greeks: {
          delta: 0.48,
          theta: -0.07,
          vega: 0.14
        },
        score: 76,
        reason: 'Low IV, positive Delta, earnings catalyst'
      },
      {
        id: 'NVDA-theta-call-2024-01-12',
        symbol: 'NVDA',
        strategy: 'Theta Call Sale',
        type: 'theta-decay',
        expiration: '2024-01-12',
        daysToExpiry: 3,
        credit: '0.85',
        maxLoss: 'Unlimited',
        maxProfit: '0.85',
        rewardRiskRatio: 'N/A',
        probability: 78,
        ivPercentile: 65,
        setup: {
          strike: 525,
          type: 'call'
        },
        greeks: {
          delta: 0.18,
          theta: -0.32,
          vega: 0.05
        },
        score: 85,
        reason: 'High theta decay, low probability of assignment'
      }
    ];
  };

  // Get strategy color
  const getStrategyColor = (type) => {
    switch(type) {
      case 'credit-spread': return '#10B981'; // Green
      case 'debit-spread': return '#3B82F6'; // Blue
      case 'iron-condor': return '#8B5CF6'; // Purple
      case 'theta-decay': return '#F59E0B'; // Amber
      default: return '#6B7280'; // Gray
    }
  };

  // Get risk color
  const getRiskColor = (probability) => {
    if (probability >= 80) return '#10B981'; // Green
    if (probability >= 70) return '#F59E0B'; // Yellow
    if (probability >= 60) return '#EF4444'; // Red
    return '#6B7280'; // Gray
  };

  // Render opportunity card
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

  // Render opportunity detail modal
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
              <Text style={styles.modalTitle}>
                {selectedOpp.symbol} - {selectedOpp.strategy}
              </Text>
              <TouchableOpacity onPress={() => setSelectedOpp(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Trade Details</Text>
                
                <View style={styles.modalGrid}>
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
                
                <View style={styles.riskMeter}>
                  <View style={styles.riskBar}>
                    <View style={[styles.riskFill, { width: `${selectedOpp.probability}%` }]} />
                  </View>
                  <Text style={styles.riskText}>
                    Probability of Profit: {selectedOpp.probability}%
                  </Text>
                </View>
                
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
              
              <View style={styles.modalSection}>
                <Text style={styles.modalSectionTitle}>Option Greeks</Text>
                
                <View style={styles.greeksModalGrid}>
                  <View style={styles.greekModalItem}>
                    <Text style={styles.greekModalSymbol}>Δ Delta</Text>
                    <Text style={styles.greekModalValue}>{selectedOpp.greeks.delta}</Text>
                    <Text style={styles.greekModalDesc}>Directional exposure</Text>
                  </View>
                  <View style={styles.greekModalItem}>
                    <Text style={styles.greekModalSymbol}>Θ Theta</Text>
                    <Text style={styles.greekModalValue}>{selectedOpp.greeks.theta}</Text>
                    <Text style={styles.greekModalDesc}>Time decay per day</Text>
                  </View>
                  <View style={styles.greekModalItem}>
                    <Text style={styles.greekModalSymbol}>ν Vega</Text>
                    <Text style={styles.greekModalValue}>{selectedOpp.greeks.vega}</Text>
                    <Text style={styles.greekModalDesc}>Volatility exposure</Text>
                  </View>
                </View>
              </View>
              
              {selectedOpp.setup && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Trade Setup</Text>
                  <View style={styles.setupContainer}>
                    {Object.entries(selectedOpp.setup).map(([key, value]) => (
                      <View key={key} style={styles.setupItem}>
                        <Text style={styles.setupLabel}>{key}:</Text>
                        <Text style={styles.setupValue}>{value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              
              {selectedOpp.reason && (
                <View style={styles.modalSection}>
                  <Text style={styles.modalSectionTitle}>Why This Trade?</Text>
                  <Text style={styles.reasonModalText}>{selectedOpp.reason}</Text>
                </View>
              )}
            </ScrollView>
            
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

  // Render scanning overlay
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
              Analyzes {symbolsToScan.length} symbols using Greeks & volume
            </Text>
          </>
        )}
      </TouchableOpacity>
      
      {/* Strategy Types */}
      <View style={styles.strategiesSection}>
        <Text style={styles.sectionTitle}>Strategy Types</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.strategiesContainer}>
            {strategies.map(strategy => (
              <View key={strategy.id} style={styles.strategyCard}>
                <Text style={styles.strategyIcon}>{strategy.icon}</Text>
                <Text style={styles.strategyName}>{strategy.name}</Text>
                <Text style={styles.strategyDesc}>{strategy.description}</Text>
                <View style={styles.strategyStats}>
                  <Text style={styles.strategyStat}>
                    Success: {strategy.successRate}
                  </Text>
                  <Text style={styles.strategyStat}>
                    Risk: {strategy.riskLevel}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      
      {/* Opportunities List */}
      <View style={styles.opportunitiesSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Top Opportunities ({opportunities.length})
          </Text>
          {opportunities.length > 0 && (
            <TouchableOpacity onPress={() => setOpportunities([])}>
              <Text style={styles.clearText}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {opportunities.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📊</Text>
            <Text style={styles.emptyStateTitle}>No opportunities yet</Text>
            <Text style={styles.emptyStateText}>
              Click "Scan for Opportunities" to find high-probability trades
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.opportunitiesList}>
            {opportunities.map(renderOpportunityCard)}
          </ScrollView>
        )}
      </View>
      
      {/* Modals */}
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
  strategiesSection: {
    marginHorizontal: 15,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  strategiesContainer: {
    flexDirection: 'row',
    paddingBottom: 10,
  },
  strategyCard: {
    width: 150,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  strategyIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  strategyName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  strategyDesc: {
    fontSize: 11,
    color: '#666',
    marginBottom: 10,
  },
  strategyStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  strategyStat: {
    fontSize: 10,
    color: '#888',
  },
  opportunitiesSection: {
    flex: 1,
    marginHorizontal: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  clearText: {
    color: '#666',
    fontSize: 14,
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
  // Modal Styles
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
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  modalClose: {
    fontSize: 24,
    color: '#999',
  },
  modalBody: {
    padding: 20,
  },
  modalSection: {
    marginBottom: 20,
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
  riskMeter: {
    marginBottom: 15,
  },
  riskBar: {
    height: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    marginBottom: 5,
    overflow: 'hidden',
  },
  riskFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  riskText: {
    fontSize: 14,
    color: '#666',
  },
  greeksModalGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  greekModalItem: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  greekModalSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  greekModalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#667eea',
    marginBottom: 5,
  },
  greekModalDesc: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  setupContainer: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
  },
  setupItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  setupLabel: {
    fontSize: 14,
    color: '#666',
    textTransform: 'capitalize',
  },
  setupValue: {
    fontSize: 14,
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
  // Scanning Overlay
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
