// src/routes/api.js or wherever your routes are

const express = require('express');
const router = express.Router();
const tradierService = require('../services/tradierService');

// ====== MARKET DATA ENDPOINTS ======

// Market overview
router.get('/market/overview', async (req, res) => {
  try {
    console.log('📊 Fetching REAL market overview from Tradier...');
    
    // Get major indices
    const indices = await tradierService.getMarketOverview();
    
    // Get some popular stocks for gainers/losers
    const popularStocks = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'AMZN', 'META', 'GOOGL'];
    const stockPromises = popularStocks.map(symbol => tradierService.getQuote(symbol));
    const stockResults = await Promise.allSettled(stockPromises);
    
    const stocks = [];
    stockResults.forEach(result => {
      if (result.status === 'fulfilled') {
        stocks.push(result.value);
      }
    });
    
    // Sort by percentage change
    const sortedStocks = stocks.sort((a, b) => b.change_percentage - a.change_percentage);
    const topGainers = sortedStocks.slice(0, 3);
    const topLosers = sortedStocks.slice(-3).reverse();
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      market_status: 'open',
      indices: indices,
      top_gainers: topGainers.map(stock => ({
        symbol: stock.symbol,
        last: stock.last,
        change: stock.change,
        change_percentage: stock.change_percentage,
        volume: stock.volume
      })),
      top_losers: topLosers.map(stock => ({
        symbol: stock.symbol,
        last: stock.last,
        change: stock.change,
        change_percentage: stock.change_percentage,
        volume: stock.volume
      })),
      message: 'Real-time data from Tradier API'
    });
    
  } catch (error) {
    console.error('Market overview error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get quote for symbol
router.get('/market/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    console.log(`📈 Fetching REAL quote for ${symbol} from Tradier...`);
    
    const quote = await tradierService.getQuote(symbol);
    
    res.json({
      success: true,
      symbol,
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
      timestamp: new Date().toISOString()
    });
  }
});

// Get options chain
router.get('/options/chain/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { expiration } = req.query;
    
    console.log(`🔗 Fetching REAL options chain for ${symbol} from Tradier...`);
    
    const chain = await tradierService.getOptionsChain(symbol, expiration);
    
    // Get current quote for underlying
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
    console.log(`📅 Fetching REAL expirations for ${symbol} from Tradier...`);
    
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

// ====== SCAN ENDPOINTS ======

// Scan top stocks for unusual options activity
router.post('/scan/top-stocks', async (req, res) => {
  try {
    console.log('🔍 Scanning for unusual options activity using REAL Tradier data...');
    
    const { limit = 5 } = req.body;
    
    // Popular stocks to scan
    const symbols = ['SPY', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'AMZN', 'META', 'GOOGL'];
    
    const scans = [];
    
    for (const symbol of symbols.slice(0, limit)) {
      try {
        // Get quote
        const quote = await tradierService.getQuote(symbol);
        
        // Get options chain for analysis
        const options = await tradierService.getOptionsChain(symbol);
        
        // Calculate unusual activity metrics
        let unusualVolume = false;
        let volumeRatio = 1.0;
        let impliedVolatility = 0;
        let confidence = 50;
        
        if (options.length > 0) {
          // Calculate average volume
          const avgVolume = options.reduce((sum, opt) => sum + opt.volume, 0) / options.length;
          
          // Find high volume options
          const highVolumeOptions = options.filter(opt => opt.volume > avgVolume * 3);
          
          if (highVolumeOptions.length > 0) {
            unusualVolume = true;
            volumeRatio = highVolumeOptions[0].volume / avgVolume;
            
            // Calculate confidence based on volume ratio
            confidence = Math.min(95, 50 + (volumeRatio * 10));
          }
          
          // Calculate average IV
          impliedVolatility = options.reduce((sum, opt) => sum + (opt.iv || 0), 0) / options.length;
        }
        
        scans.push({
          symbol,
          price: quote.last,
          change: quote.change,
          change_percentage: quote.change_percentage,
          volume: quote.volume,
          unusual_volume: unusualVolume,
          volume_ratio: volumeRatio.toFixed(2),
          implied_volatility: impliedVolatility.toFixed(3),
          confidence: Math.round(confidence),
          timestamp: new Date().toISOString()
        });
        
      } catch (symbolError) {
        console.error(`Error scanning ${symbol}:`, symbolError.message);
      }
    }
    
    // Sort by confidence (highest first)
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
    console.log(`🔍 Scanning ${symbol} using REAL Tradier data...`);
    
    // Get quote
    const quote = await tradierService.getQuote(symbol);
    
    // Get options chain
    const options = await tradierService.getOptionsChain(symbol);
    
    // Calculate metrics
    let unusualVolume = false;
    let volumeRatio = 1.0;
    let impliedVolatility = 0;
    let confidence = 50;
    
    if (options.length > 0) {
      // Calculate volume metrics
      const volumes = options.map(opt => opt.volume).filter(v => v > 0);
      const avgVolume = volumes.length > 0 ? volumes.reduce((sum, v) => sum + v, 0) / volumes.length : 0;
      
      // Find unusual volume
      const unusualOptions = options.filter(opt => opt.volume > avgVolume * 5 && opt.volume > 100);
      
      if (unusualOptions.length > 0) {
        unusualVolume = true;
        volumeRatio = unusualOptions[0].volume / Math.max(avgVolume, 1);
        confidence = Math.min(95, 60 + (volumeRatio * 5));
      }
      
      // Calculate IV metrics
      const ivs = options.map(opt => opt.iv).filter(iv => iv > 0);
      impliedVolatility = ivs.length > 0 ? ivs.reduce((sum, iv) => sum + iv, 0) / ivs.length : 0;
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
      unusual_volume: unusualVolume,
      volume_ratio: volumeRatio.toFixed(2),
      implied_volatility: impliedVolatility.toFixed(3),
      confidence: Math.round(confidence),
      options_count: options.length,
      expirations: expirations.slice(0, 5), // Next 5 expirations
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

// Get scan history (simplified - would normally use database)
router.get('/scan/history', async (req, res) => {
  try {
    console.log('📋 Getting scan history...');
    
    // For now, return empty or mock
    // In production, you would query a database
    
    res.json({
      success: true,
      scans: [],
      count: 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Scan history error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
