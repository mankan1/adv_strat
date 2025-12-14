// src/routes/api.js - COMPLETE VERSION
const express = require('express');
const router = express.Router();

// Import Tradier service
let tradierService;
try {
  tradierService = require('../services/tradierService');
  console.log('✅ Tradier service loaded');
} catch (error) {
  console.error('❌ Tradier service failed to load:', error.message);
  console.log('⚠️  Using placeholder responses - add TRADIER_API_KEY to .env');
}

// ====== STATUS ENDPOINTS ======

// Root endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'Options Analysis API',
    version: '1.0.0',
    endpoints: [
      '/health',
      '/market/overview',
      '/market/quote/:symbol',
      '/scan/top-stocks (POST)',
      '/scan/stock/:symbol',
      '/options/chain/:symbol',
      '/options/expirations/:symbol'
    ]
  });
});

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Options Analysis API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    tradier_configured: !!(process.env.TRADIER_API_KEY && process.env.TRADIER_API_KEY !== 'your_tradier_api_key_here')
  });
});

// ====== MARKET DATA ENDPOINTS ======

// Market overview
router.get('/market/overview', async (req, res) => {
  try {
    console.log('📊 GET /market/overview');
    
    if (!tradierService) {
      throw new Error('Tradier service not available. Check TRADIER_API_KEY in .env');
    }
    
    // Get major indices
    const indices = ['SPY', 'QQQ', 'DIA', 'IWM'];
    const quotes = [];
    
    for (const symbol of indices) {
      try {
        const quote = await tradierService.getQuote(symbol);
        quotes.push({
          symbol: quote.symbol,
          last: quote.last,
          change: quote.change,
          change_percentage: quote.change_percentage,
          volume: quote.volume
        });
      } catch (error) {
        console.error(`Failed to fetch ${symbol}:`, error.message);
      }
    }
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      market_status: quotes.length > 0 ? 'open' : 'unknown',
      indices: quotes,
      total_volume: quotes.reduce((sum, q) => sum + (q.volume || 0), 0),
      source: 'Tradier API',
      note: 'Real-time market data'
    });
    
  } catch (error) {
    console.error('Market overview error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
      hint: 'Check TRADIER_API_KEY in .env file'
    });
  }
});

// Get quote for symbol - YOU ALREADY HAVE THIS
router.get('/market/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`📈 GET /market/quote/${symbol}`);
    
    if (!tradierService) {
      throw new Error('Tradier service not available. Check TRADIER_API_KEY in .env');
    }
    
    const quote = await tradierService.getQuote(symbol);
    
    res.json({
      success: true,
      ...quote,
      timestamp: new Date().toISOString(),
      source: 'Tradier API'
    });
    
  } catch (error) {
    console.error(`Quote error for ${req.params.symbol}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.params.symbol,
      timestamp: new Date().toISOString(),
      hint: 'Make sure symbol is valid and TRADIER_API_KEY is set'
    });
  }
});

// ====== SCAN ENDPOINTS ======

// Scan top stocks for unusual options activity
router.post('/scan/top-stocks', async (req, res) => {
  try {
    console.log('🔍 POST /scan/top-stocks');
    
    if (!tradierService) {
      throw new Error('Tradier service not available. Check TRADIER_API_KEY in .env');
    }
    
    const { limit = 5 } = req.body;
    
    // Popular stocks to scan
    const symbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN'];//['SPY', 'AAPL', 'MSFT', 'NVDA', 'TSLA'];
  //   [
  //   'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN',//];
  //   "SOXS", "OCG", "YCBD", "NVDA", "CGC", "BBAI", "TQQQ", "SOXL", "WOK", "TZA", "PLUG", "SPY", "ASST", "TSLL", "RIVN", "AVGO", "TSLA", "TSLS", "MSOS", "ONDS", "INTC", "TLRY",

  //   "ATPC", "SLV", "QQQ", "IQ", "TNYA", "JDST", "XLF", "BEAT", "FRMI", "TE", "KAVL", "IWM", "SQQQ", "ASBP", "ORCL", "SOFI", "VIVK", "BMNR", "PFE", "ZDGE", "DNN", "OPEN", "NFLX",

  //   "HPE", "F", "AAL", "PLTD", "IBIT", "ETHA", "TLT", "KVUE", "WBD", "HYG", "QID", "WULF", "UGRO", "MARA", "PLTR", "RR", "BMNU", "BYND", "VALE", "SPDN", "BAC", "UVIX", "AAPL",

  //   "LQD", "ACHR", "APLT", "SNAP", "CLSK", "NVD", "BITF", "IVP", "AMD", "FNGD", "NU", "GOGL", "AMZN", "IREN", "IRBT", "RZLT", "CRWV", "BTG", "BITO", "T", "NCI", "CVE", "RIG",

  //   "RKLB", "QBTS", "XLE", "NIO", "RWM", "MISL", "HOOD", "CIFR", "PL",
  //     'SPY', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'QQQ',
  //   'AMZN', 'GOOGL', 'META', 'AMD', 'AVGO', 'BRK-B', 'JPM',
  //   'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH', 'HD', 'CVX',
  //   'XOM', 'ABBV', 'PFE', 'LLY', 'BAC', 'KO', 'PEP',
  //   'MRK', 'TMO', 'COST', 'DHR', 'MCD', 'CSCO', 'ACN',
  //   'ABT', 'ADBE', 'CRM', 'LIN', 'NFLX', 'DIS', 'WFC',
  //   'CMCSA', 'PM', 'TXN', 'NKE', 'ORCL', 'UPS', 'RTX',
  //   'SCHW', 'AMT', 'PLD', 'NOW', 'GS', 'BLK', 'LOW'
  // ];//];
  //  SOXS, OCG, YCBD, NVDA, CGC, BBAI, TQQQ, SOXL, WOK, TZA, PLUG, SPY, ASST, TSLL, RIVN, AVGO, TSLA, TSLS, MSOS, ONDS, INTC, TLRY

  //  ATPC, SLV, QQQ, IQ, TNYA, JDST, XLF, BEAT, FRMI, TE, KAVL, IWM, SQQQ, ASBP, ORCL, SOFI, VIVK, BMNR, PFE, ZDGE, DNN, OPEN, NFLX
   
   
  //  HPE, F, AAL, PLTD, IBIT, ETHA, TLT, KVUE, WBD, HYG, QID, WULF, UGRO, MARA, PLTR, RR, BMNU, BYND, VALE, SPDN, BAC, UVIX, AAPL
   
   
  //  LQD, ACHR, APLT, SNAP, CLSK, NVD, BITF, IVP, AMD, FNGD, NU, GOGL, AMZN, IREN, IRBT, RZLT, CRWV, BTG, BITO, T, NCI, CVE, RIG
   
   
  //  RKLB, QBTS, XLE, NIO, RWM, MISL, HOOD, CIFR, PL

    const scans = [];
    
    for (const symbol of symbols.slice(0, limit)) {
      try {
        // Get real quote
        const quote = await tradierService.getQuote(symbol);
        
        // Get options chain
        const options = await tradierService.getOptionsChain(symbol);
        
        // Calculate confidence based on volume
        let confidence = 50;
        let unusual_volume = false;
        let volume_ratio = 1.0;
        
        if (options.length > 0) {
          const volumes = options.map(opt => opt.volume).filter(v => v > 0);
          if (volumes.length > 0) {
            const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
            const maxVolume = Math.max(...volumes);
            
            if (maxVolume > avgVolume * 2) {
              unusual_volume = true;
              volume_ratio = (maxVolume / avgVolume).toFixed(2);
              confidence = Math.min(95, 60 + (volume_ratio * 10));
            }
          }
        }
        
        scans.push({
          symbol,
          price: quote.last,
          change: quote.change,
          change_percentage: quote.change_percentage,
          confidence: Math.round(confidence),
          unusual_volume,
          volume_ratio,
          options_count: options.length,
          timestamp: new Date().toISOString()
        });
        
      } catch (symbolError) {
        console.error(`Error scanning ${symbol}:`, symbolError.message);
      }
    }
    
    // Sort by confidence
    scans.sort((a, b) => b.confidence - a.confidence);
    
    res.json({
      success: true,
      scans,
      count: scans.length,
      timestamp: new Date().toISOString(),
      source: 'Tradier API Analysis'
    });
    
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Scan single stock
router.get('/scan/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`🔍 GET /scan/stock/${symbol}`);
    
    if (!tradierService) {
      throw new Error('Tradier service not available. Check TRADIER_API_KEY in .env');
    }
    
    // Get real quote
    const quote = await tradierService.getQuote(symbol);
    
    // Get options chain
    const options = await tradierService.getOptionsChain(symbol);
    
    // Calculate metrics
    let confidence = 50;
    let unusual_volume = false;
    let volume_ratio = 1.0;
    
    if (options.length > 0) {
      const volumes = options.map(opt => opt.volume).filter(v => v > 0);
      if (volumes.length > 0) {
        const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
        const maxVolume = Math.max(...volumes);
        
        if (maxVolume > avgVolume * 3) {
          unusual_volume = true;
          volume_ratio = (maxVolume / avgVolume).toFixed(2);
          confidence = Math.min(95, 65 + (volume_ratio * 8));
        }
      }
    }
    
    // Get expirations
    const expirations = await tradierService.getOptionExpirations(symbol);
    
    res.json({
      success: true,
      symbol,
      price: quote.last,
      change: quote.change,
      change_percentage: quote.change_percentage,
      volume: quote.volume,
      confidence: Math.round(confidence),
      unusual_volume,
      volume_ratio,
      options_count: options.length,
      expirations: expirations.slice(0, 5),
      timestamp: new Date().toISOString(),
      source: 'Tradier API Analysis'
    });
    
  } catch (error) {
    console.error(`Scan error for ${req.params.symbol}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      symbol: req.params.symbol,
      timestamp: new Date().toISOString()
    });
  }
});

// ====== OPTIONS ENDPOINTS ======

// Get options chain
router.get('/options/chain/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { expiration } = req.query;
    
    console.log(`🔗 GET /options/chain/${symbol}${expiration ? `?expiration=${expiration}` : ''}`);
    
    if (!tradierService) {
      throw new Error('Tradier service not available. Check TRADIER_API_KEY in .env');
    }
    
    const chain = await tradierService.getOptionsChain(symbol, expiration);
    const quote = await tradierService.getQuote(symbol);
    
    res.json({
      success: true,
      symbol,
      expiration: expiration || 'nearest',
      underlying_price: quote.last,
      options: chain,
      count: chain.length,
      timestamp: new Date().toISOString(),
      source: 'Tradier API'
    });
    
  } catch (error) {
    console.error(`Options chain error for ${req.params.symbol}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.params.symbol,
      timestamp: new Date().toISOString()
    });
  }
});

// Get expiration dates
router.get('/options/expirations/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`📅 GET /options/expirations/${symbol}`);
    
    if (!tradierService) {
      throw new Error('Tradier service not available. Check TRADIER_API_KEY in .env');
    }
    
    const expirations = await tradierService.getOptionExpirations(symbol);
    
    res.json({
      success: true,
      symbol,
      expirations,
      count: expirations.length,
      timestamp: new Date().toISOString(),
      source: 'Tradier API'
    });
    
  } catch (error) {
    console.error(`Expirations error for ${req.params.symbol}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.params.symbol,
      timestamp: new Date().toISOString()
    });
  }
});

// ====== EXPORT ======

module.exports = router;
