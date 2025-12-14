const analysisService = require('../services/analysisService');
const tradierService = require('../services/tradierService');
const marketDataService = require('../services/marketDataService');

class ScanController {
  constructor() {
    this.scanHistory = new Map();
    this.MAX_HISTORY_SIZE = 1000;
  }

  async scanTopStocks(req, res) {
    try {
      const { limit = 8, minVolume = 1000, minConfidence = 50 } = req.body;
      
      console.log(`🔍 Scanning top ${limit} stocks for unusual options activity...`);
      
      // Validate API key first
      const isValidKey = await tradierService.validateAPIKey();
      if (!isValidKey) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Tradier API key. Please check your .env file.',
          message: 'Get your API key from: https://tradier.com/settings/api'
        });
      }
      
      // Get top stocks (using actual Tradier data)
      const topStocks = await tradierService.getTopActiveOptions();
      const symbols = topStocks
        .filter(stock => stock.volume >= minVolume)
        .map(stock => stock.symbol)
        .slice(0, limit);
      
      if (symbols.length === 0) {
        return res.json({
          success: true,
          message: 'No stocks meet the minimum volume criteria',
          results: [],
          timestamp: new Date().toISOString()
        });
      }
      
      // Scan each symbol
      const scanResults = [];
      const scanPromises = symbols.map(async (symbol) => {
        try {
          const result = await this.scanSingleStockInternal(symbol);
          
          // Filter by confidence
          if (result.confidence >= minConfidence) {
            scanResults.push(result);
            
            // Store in history
            this.addToHistory(symbol, result);
            
            // Emit real-time update
            this.emitRealTimeUpdate(req, symbol, result);
          }
          
          return result;
        } catch (error) {
          console.error(`Error scanning ${symbol}:`, error.message);
          return null;
        }
      });
      
      await Promise.allSettled(scanPromises);
      
      // Sort by confidence
      scanResults.sort((a, b) => b.confidence - a.confidence);
      
      // Get market context
      const marketData = marketDataService.getMarketData();
      const sectorPerformance = await marketDataService.getSectorPerformance();
      
      res.json({
        success: true,
        count: scanResults.length,
        totalScanned: symbols.length,
        results: scanResults,
        marketContext: {
          sentiment: marketData.sentiment,
          indices: marketData.indices,
          topSectors: Object.entries(sectorPerformance)
            .slice(0, 3)
            .map(([sector, data]) => ({ sector, ...data }))
        },
        timestamp: new Date().toISOString(),
        scanDuration: `${Date.now() - req.startTime}ms`
      });
      
    } catch (error) {
      console.error('Top stocks scan error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        message: 'Scan failed. Please check your Tradier API configuration.',
        results: this.getFallbackData(),
        timestamp: new Date().toISOString()
      });
    }
  }

  async scanSingleStock(req, res) {
    try {
      const { symbol } = req.params;
      const { expiration } = req.query;
      
      console.log(`🔍 Scanning single stock: ${symbol}${expiration ? ` (exp: ${expiration})` : ''}`);
      
      // Validate symbol
      if (!symbol || symbol.length > 6) {
        return res.status(400).json({
          success: false,
          error: 'Invalid stock symbol'
        });
      }
      
      // Validate API key
      const isValidKey = await tradierService.validateAPIKey();
      if (!isValidKey) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Tradier API key',
          instructions: 'Please add your Tradier API key to the .env file'
        });
      }
      
      const result = await this.scanSingleStockInternal(symbol, expiration);
      
      // Store in history
      this.addToHistory(symbol, result);
      
      // Emit real-time update
      this.emitRealTimeUpdate(req, symbol, result);
      
      res.json({
        success: true,
        ...result,
        marketData: marketDataService.getMarketData(),
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`Single scan error for ${req.params.symbol}:`, error);
      res.status(500).json({
        success: false,
        error: error.message,
        symbol: req.params.symbol,
        message: 'Using enhanced mock data',
        ...this.getEnhancedMockData(req.params.symbol),
        timestamp: new Date().toISOString()
      });
    }
  }

  async scanSingleStockInternal(symbol, expiration = null) {
    // Get stock quote
    const quote = await tradierService.getQuote(symbol);
    
    if (!quote || !quote.last) {
      throw new Error(`Unable to get quote for ${symbol}`);
    }
    
    // Get unusual activity
    const unusualActivity = await analysisService.scanUnusualActivity(symbol);
    
    // Get options chain for additional analysis
    const optionsChain = await tradierService.getOptionsChain(symbol, expiration);
    
    // Calculate volume metrics
    const volumeMetrics = this.calculateVolumeMetrics(optionsChain);
    
    // Determine sentiment
    const sentiment = this.determineSentiment(unusualActivity);
    
    return {
      symbol,
      underlyingPrice: quote.last,
      underlyingChange: quote.change,
      underlyingChangePercent: quote.change_percentage,
      volume: quote.volume,
      unusualActivity,
      optionsMetrics: volumeMetrics,
      sentiment,
      confidence: this.calculateOverallConfidence(unusualActivity),
      scanTime: new Date().toISOString(),
      dataQuality: 'REAL_TIME',
      source: 'TRADIER_API'
    };
  }

  calculateVolumeMetrics(optionsChain) {
    if (!optionsChain || optionsChain.length === 0) {
      return {
        totalVolume: 0,
        totalOpenInterest: 0,
        putCallRatio: 0,
        avgImpliedVolatility: 0
      };
    }
    
    let totalVolume = 0;
    let totalOpenInterest = 0;
    let callVolume = 0;
    let putVolume = 0;
    let totalIV = 0;
    let ivCount = 0;
    
    optionsChain.forEach(option => {
      totalVolume += option.volume || 0;
      totalOpenInterest += option.open_interest || 0;
      totalIV += option.implied_volatility || 0;
      if (option.implied_volatility) ivCount++;
      
      if (option.option_type === 'call') {
        callVolume += option.volume || 0;
      } else {
        putVolume += option.volume || 0;
      }
    });
    
    return {
      totalVolume,
      totalOpenInterest,
      putCallRatio: callVolume > 0 ? (putVolume / callVolume) : 0,
      avgImpliedVolatility: ivCount > 0 ? totalIV / ivCount : 0,
      callVolume,
      putVolume
    };
  }

  determineSentiment(unusualActivity) {
    const calls = unusualActivity.calls || [];
    const puts = unusualActivity.puts || [];
    
    if (calls.length === 0 && puts.length === 0) return 'NEUTRAL';
    
    const callConfidence = calls.reduce((sum, call) => sum + (call.confidence || 0), 0) / Math.max(calls.length, 1);
    const putConfidence = puts.reduce((sum, put) => sum + (put.confidence || 0), 0) / Math.max(puts.length, 1);
    
    const callVolume = calls.reduce((sum, call) => sum + (call.volume || 0), 0);
    const putVolume = puts.reduce((sum, put) => sum + (put.volume || 0), 0);
    
    // Weighted sentiment
    const score = (callConfidence * 0.4 + callVolume * 0.1) - (putConfidence * 0.4 + putVolume * 0.1);
    
    if (score > 20) return 'STRONGLY_BULLISH';
    if (score > 10) return 'BULLISH';
    if (score < -20) return 'STRONGLY_BEARISH';
    if (score < -10) return 'BEARISH';
    return 'NEUTRAL';
  }

  calculateOverallConfidence(unusualActivity) {
    const allOptions = [
      ...(unusualActivity.calls || []),
      ...(unusualActivity.puts || [])
    ];
    
    if (allOptions.length === 0) return 0;
    
    const avgConfidence = allOptions.reduce((sum, opt) => sum + (opt.confidence || 0), 0) / allOptions.length;
    
    // Boost confidence if there are strategies
    const strategyBoost = (unusualActivity.strategies || []).length * 5;
    
    return Math.min(100, Math.round(avgConfidence + strategyBoost));
  }

  addToHistory(symbol, result) {
    if (!this.scanHistory.has(symbol)) {
      this.scanHistory.set(symbol, []);
    }
    
    const history = this.scanHistory.get(symbol);
    history.unshift({
      ...result,
      timestamp: new Date().toISOString()
    });
    
    // Keep only recent scans
    if (history.length > 10) {
      history.length = 10;
    }
    
    // Clean up old entries if map gets too large
    if (this.scanHistory.size > this.MAX_HISTORY_SIZE) {
      const keys = Array.from(this.scanHistory.keys()).slice(0, this.MAX_HISTORY_SIZE / 2);
      keys.forEach(key => this.scanHistory.delete(key));
    }
  }

  emitRealTimeUpdate(req, symbol, result) {
    const io = req.app.get('socketio');
    if (io) {
      io.to(`scans-${symbol}`).emit('scan-update', {
        symbol,
        data: result,
        timestamp: new Date().toISOString()
      });
      
      // Also emit to general scans room
      io.to('scans-all').emit('new-scan', {
        symbol,
        confidence: result.confidence,
        sentiment: result.sentiment,
        timestamp: new Date().toISOString()
      });
    }
  }

  getFallbackData() {
    // Enhanced fallback with realistic data
    // const symbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN'];
    const symbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN'];
    // "SOXS", "OCG", "YCBD", "NVDA", "CGC", "BBAI", "TQQQ", "SOXL", "WOK", "TZA", "PLUG", "SPY", "ASST", "TSLL", "RIVN", "AVGO", "TSLA", "TSLS", "MSOS", "ONDS", "INTC", "TLRY",

    // "ATPC", "SLV", "QQQ", "IQ", "TNYA", "JDST", "XLF", "BEAT", "FRMI", "TE", "KAVL", "IWM", "SQQQ", "ASBP", "ORCL", "SOFI", "VIVK", "BMNR", "PFE", "ZDGE", "DNN", "OPEN", "NFLX",

    // "HPE", "F", "AAL", "PLTD", "IBIT", "ETHA", "TLT", "KVUE", "WBD", "HYG", "QID", "WULF", "UGRO", "MARA", "PLTR", "RR", "BMNU", "BYND", "VALE", "SPDN", "BAC", "UVIX", "AAPL",

    // "LQD", "ACHR", "APLT", "SNAP", "CLSK", "NVD", "BITF", "IVP", "AMD", "FNGD", "NU", "GOGL", "AMZN", "IREN", "IRBT", "RZLT", "CRWV", "BTG", "BITO", "T", "NCI", "CVE", "RIG",

    // "RKLB", "QBTS", "XLE", "NIO", "RWM", "MISL", "HOOD", "CIFR", "PL"];
    
    return symbols.map(symbol => ({
      symbol,
      underlyingPrice: this.getMockPrice(symbol),
      underlyingChange: (Math.random() > 0.5 ? '+' : '-') + (Math.random() * 3).toFixed(2) + '%',
      unusualActivity: {
        calls: this.generateMockCalls(symbol),
        puts: this.generateMockPuts(symbol),
        strategies: this.generateMockStrategies()
      },
      sentiment: ['BULLISH', 'BEARISH', 'NEUTRAL'][Math.floor(Math.random() * 3)],
      confidence: 40 + Math.floor(Math.random() * 40),
      scanTime: new Date().toISOString(),
      dataQuality: 'MOCK_FALLBACK',
      source: 'FALLBACK_DATA'
    }));
  }

  getEnhancedMockData(symbol) {
    const basePrice = this.getMockPrice(symbol);
    
    return {
      symbol,
      underlyingPrice: basePrice,
      underlyingChange: (Math.random() > 0.5 ? '+' : '-') + (Math.random() * 5).toFixed(2) + '%',
      unusualActivity: {
        calls: this.generateMockCalls(symbol, basePrice),
        puts: this.generateMockPuts(symbol, basePrice),
        strategies: this.generateMockStrategies()
      },
      optionsMetrics: {
        totalVolume: Math.floor(Math.random() * 50000) + 10000,
        totalOpenInterest: Math.floor(Math.random() * 100000) + 50000,
        putCallRatio: 0.5 + Math.random() * 0.5,
        avgImpliedVolatility: 0.25 + Math.random() * 0.2
      },
      sentiment: ['STRONGLY_BULLISH', 'BULLISH', 'NEUTRAL', 'BEARISH', 'STRONGLY_BEARISH'][Math.floor(Math.random() * 5)],
      confidence: 30 + Math.floor(Math.random() * 50),
      scanTime: new Date().toISOString(),
      dataQuality: 'ENHANCED_MOCK',
      source: 'DEMO_DATA'
    };
  }

  getMockPrice(symbol) {
    const prices = {
      'SPY': 476.85, 'QQQ': 415.32, 'AAPL': 185.25, 'MSFT': 385.45,
      'NVDA': 495.22, 'TSLA': 245.67, 'GOOGL': 142.30, 'AMZN': 153.75,
      'META': 352.18, 'AMD': 128.45, 'INTC': 44.32, 'JPM': 172.89
    };
    
    return prices[symbol] || 100 + Math.random() * 200;
  }

  generateMockCalls(symbol, basePrice = 100) {
    const calls = [];
    const numCalls = Math.floor(Math.random() * 3) + 1;
    
    for (let i = 0; i < numCalls; i++) {
      const strike = Math.round(basePrice * (0.98 + Math.random() * 0.06));
      calls.push({
        symbol: `${symbol}240119C00${strike}000`,
        strike,
        type: 'call',
        lastPrice: (Math.random() * 5 + 0.5).toFixed(2),
        volume: Math.floor(Math.random() * 5000) + 1000,
        openInterest: Math.floor(Math.random() * 10000) + 2000,
        impliedVolatility: 0.2 + Math.random() * 0.3,
        delta: 0.3 + Math.random() * 0.5,
        theta: -(0.05 + Math.random() * 0.03),
        confidence: 50 + Math.floor(Math.random() * 40),
        reasons: ['Volume spike detected', 'Unusual open interest']
      });
    }
    
    return calls;
  }

  generateMockPuts(symbol, basePrice = 100) {
    const puts = [];
    const numPuts = Math.floor(Math.random() * 3) + 1;
    
    for (let i = 0; i < numPuts; i++) {
      const strike = Math.round(basePrice * (0.94 + Math.random() * 0.06));
      puts.push({
        symbol: `${symbol}240119P00${strike}000`,
        strike,
        type: 'put',
        lastPrice: (Math.random() * 4 + 0.3).toFixed(2),
        volume: Math.floor(Math.random() * 4000) + 800,
        openInterest: Math.floor(Math.random() * 8000) + 1500,
        impliedVolatility: 0.25 + Math.random() * 0.3,
        delta: -(0.3 + Math.random() * 0.5),
        theta: -(0.04 + Math.random() * 0.02),
        confidence: 50 + Math.floor(Math.random() * 40),
        reasons: ['High put/call ratio', 'Large block trade']
      });
    }
    
    return puts;
  }

  generateMockStrategies() {
    const strategies = [
      {
        type: 'VERTICAL_SPREAD',
        name: 'Bull Call Spread',
        maxProfit: (Math.random() * 3 + 0.5).toFixed(2),
        maxLoss: (Math.random() * 2 + 0.2).toFixed(2),
        probability: 40 + Math.floor(Math.random() * 40),
        description: 'Bullish strategy with limited risk'
      },
      {
        type: 'IRON_CONDOR',
        name: 'Iron Condor',
        maxProfit: (Math.random() * 2 + 0.3).toFixed(2),
        maxLoss: (Math.random() * 4 + 0.5).toFixed(2),
        probability: 50 + Math.floor(Math.random() * 30),
        description: 'Neutral strategy for range-bound markets'
      }
    ];
    
    return strategies.slice(0, Math.floor(Math.random() * 2) + 1);
  }

  // Additional endpoints
  async getScanHistory(req, res) {
    try {
      const { symbol, limit = 10 } = req.query;
      
      if (symbol) {
        const history = this.scanHistory.get(symbol) || [];
        res.json({
          success: true,
          symbol,
          history: history.slice(0, limit),
          count: history.length
        });
      } else {
        // Get all recent scans
        const allScans = [];
        this.scanHistory.forEach((scans, sym) => {
          if (scans.length > 0) {
            allScans.push({
              symbol: sym,
              lastScan: scans[0],
              scanCount: scans.length
            });
          }
        });
        
        res.json({
          success: true,
          scans: allScans.sort((a, b) => 
            new Date(b.lastScan.timestamp) - new Date(a.lastScan.timestamp)
          ).slice(0, limit),
          totalSymbols: this.scanHistory.size
        });
      }
      
    } catch (error) {
      console.error('Scan history error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async getMarketOverview(req, res) {
    try {
      const marketData = marketDataService.getMarketData();
      const sectorPerformance = await marketDataService.getSectorPerformance();
      const mostActive = await marketDataService.getMostActive();
      
      res.json({
        success: true,
        ...marketData,
        sectorPerformance,
        mostActive,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Market overview error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

module.exports = new ScanController();
