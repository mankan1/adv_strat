const express = require('express');
const router = express.Router();
const scanController = require('../controllers/scanController');

// Request timing middleware
router.use((req, res, next) => {
  req.startTime = Date.now();
  next();
});

// ====== SCAN ENDPOINTS ======
// Add this route to your existing router

// ====== ADVANCED TRADING ENDPOINTS ======

// Analyze complex options strategy
router.post('/trading/analyze-strategy', async (req, res) => {
  try {
    const { symbol, strategy, legs } = req.body;
    
    console.log(`🧮 Analyzing ${strategy} strategy for ${symbol} with ${legs.length} legs`);
    
    const tradierService = require('../services/tradierService');
    
    // Get current quote
    const quote = await tradierService.getQuote(symbol);
    
    // Get options data for each leg
    const analyzedLegs = await Promise.all(
      legs.map(async (leg) => {
        try {
          // Get options chain for this expiration
          const chain = await tradierService.getOptionsChain(symbol, leg.expiration);
          
          // Find matching option
          const matchingOption = chain.find(opt => 
            opt.type === leg.type && 
            opt.strike === leg.strike
          );
          
          if (matchingOption) {
            return {
              ...leg,
              bid: matchingOption.bid,
              ask: matchingOption.ask,
              mid: (matchingOption.bid + matchingOption.ask) / 2,
              delta: matchingOption.delta,
              gamma: matchingOption.gamma,
              theta: matchingOption.theta,
              vega: matchingOption.vega,
              iv: matchingOption.iv,
              volume: matchingOption.volume,
              open_interest: matchingOption.open_interest
            };
          }
          
          return leg;
        } catch (error) {
          console.error(`Error fetching data for leg ${leg.id}:`, error);
          return leg;
        }
      })
    );
    
    // Calculate strategy metrics
    let netPremium = 0;
    let maxProfit = 0;
    let maxLoss = 0;
    let totalDelta = 0;
    let totalTheta = 0;
    let totalVega = 0;
    
    analyzedLegs.forEach(leg => {
      const legValue = (leg.mid || leg.premium || 0) * leg.quantity * 100;
      const multiplier = leg.position === 'long' ? -1 : 1;
      
      netPremium += (legValue * multiplier);
      totalDelta += (leg.delta || 0) * leg.quantity * multiplier;
      totalTheta += (leg.theta || 0) * leg.quantity * multiplier;
      totalVega += (leg.vega || 0) * leg.quantity * multiplier;
    });
    
    // Strategy-specific calculations
    let breakevens = [];
    let riskRewardRatio = 0;
    
    switch(strategy) {
      case 'vertical-spread':
        const longLeg = analyzedLegs.find(l => l.position === 'long');
        const shortLeg = analyzedLegs.find(l => l.position === 'short');
        
        if (longLeg && shortLeg) {
          const width = Math.abs(shortLeg.strike - longLeg.strike);
          maxLoss = Math.abs(netPremium);
          maxProfit = (width * 100) - maxLoss;
          
          if (longLeg.type === 'call') {
            breakevens = [longLeg.strike + (maxLoss / 100)];
          } else {
            breakevens = [longLeg.strike - (maxLoss / 100)];
          }
          
          riskRewardRatio = maxProfit / maxLoss;
        }
        break;
        
      case 'iron-condor':
        // Simplified calculation for Iron Condor
        maxLoss = Math.abs(netPremium);
        maxProfit = Math.abs(netPremium) * 0.5; // Simplified
        breakevens = [
          quote.last * 0.95,
          quote.last * 1.05
        ];
        riskRewardRatio = maxProfit / maxLoss;
        break;
        
      default:
        // Generic calculation for custom strategies
        maxLoss = Math.abs(netPremium);
        maxProfit = Math.abs(netPremium) * 2; // Assume 2:1 reward for custom
        riskRewardRatio = maxProfit / maxLoss;
    }
    
    // Generate P/L curve data points
    const plData = generatePLCurve(analyzedLegs, quote.last);
    
    // Calculate probability of profit (simplified)
    const probability = calculateProbabilityOfProfit(analyzedLegs, quote.last);
    
    res.json({
      success: true,
      symbol,
      strategy,
      underlyingPrice: quote.last,
      analysis: {
        netPremium: parseFloat(netPremium.toFixed(2)),
        maxProfit: parseFloat(maxProfit.toFixed(2)),
        maxLoss: parseFloat(maxLoss.toFixed(2)),
        breakevens: breakevens.map(b => parseFloat(b.toFixed(2))),
        riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
        probability: parseFloat(probability.toFixed(1)),
        greeks: {
          delta: parseFloat(totalDelta.toFixed(3)),
          theta: parseFloat(totalTheta.toFixed(2)),
          vega: parseFloat(totalVega.toFixed(2))
        },
        legs: analyzedLegs,
        plCurve: plData
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Strategy analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to generate P/L curve
function generatePLCurve(legs, currentPrice) {
  const data = [];
  const priceRange = currentPrice * 0.4; // ±40% range
  const steps = 50;
  const stepSize = (priceRange * 2) / steps;
  
  for (let i = 0; i <= steps; i++) {
    const price = currentPrice - priceRange + (stepSize * i);
    let totalPL = 0;
    
    legs.forEach(leg => {
      let legPL = 0;
      const multiplier = leg.position === 'long' ? 1 : -1;
      const contractMultiplier = 100;
      const premium = leg.mid || leg.premium || 0;
      
      if (leg.type === 'call') {
        if (price > leg.strike) {
          legPL = (price - leg.strike - premium) * contractMultiplier * multiplier;
        } else {
          legPL = -premium * contractMultiplier * multiplier;
        }
      } else { // put
        if (price < leg.strike) {
          legPL = (leg.strike - price - premium) * contractMultiplier * multiplier;
        } else {
          legPL = -premium * contractMultiplier * multiplier;
        }
      }
      
      totalPL += legPL * leg.quantity;
    });
    
    data.push({
      price: parseFloat(price.toFixed(2)),
      pl: parseFloat(totalPL.toFixed(2))
    });
  }
  
  return data;
}

// Helper function to calculate probability of profit
function calculateProbabilityOfProfit(legs, currentPrice) {
  // Simplified probability calculation using delta
  let totalDelta = 0;
  
  legs.forEach(leg => {
    const multiplier = leg.position === 'long' ? 1 : -1;
    totalDelta += (leg.delta || 0) * leg.quantity * multiplier;
  });
  
  // Convert delta to rough probability
  // This is a simplification - real probability requires more complex calculation
  const baseProb = 50;
  const deltaImpact = totalDelta * 20; // Scale delta to probability impact
  
  return Math.max(5, Math.min(95, baseProb + deltaImpact));
}

// Save strategy to history
router.post('/trading/save-strategy', async (req, res) => {
  try {
    const strategyData = req.body;
    
    // Here you would save to database
    // For now, we'll just return success
    
    res.json({
      success: true,
      message: 'Strategy saved successfully',
      id: Date.now().toString(),
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add /status endpoint that matches what frontend expects
router.get('/status', (req, res) => {
  const tradierService = require('../services/tradierService');
  
  res.json({
    success: true,
    service: 'Options Analysis API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    tradierMode: process.env.TRADIER_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUCTION',
    apiKeyConfigured: !!process.env.TRADIER_API_KEY && process.env.TRADIER_API_KEY !== 'your_tradier_api_key_here',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Get saved strategies
router.get('/trading/saved-strategies', async (req, res) => {
  try {
    // In a real app, fetch from database
    // For demo, return empty array or mock data
    
    res.json({
      success: true,
      strategies: [],
      count: 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Scan top stocks for unusual options activity
router.post('/scan/top-stocks', scanController.scanTopStocks);

// Scan single stock
router.get('/scan/stock/:symbol', scanController.scanSingleStock);

// Get scan history
router.get('/scan/history', scanController.getScanHistory);

// ====== MARKET DATA ENDPOINTS ======

// Market overview
router.get('/market/overview', scanController.getMarketOverview);

// Get quote for symbol
router.get('/market/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const tradierService = require('../services/tradierService');
    
    const quote = await tradierService.getQuote(symbol);
    
    res.json({
      success: true,
      symbol,
      ...quote,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`Quote error for ${req.params.symbol}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.params.symbol 
    });
  }
});

// Get options chain
router.get('/options/chain/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { expiration } = req.query;
    const tradierService = require('../services/tradierService');
    
    const chain = await tradierService.getOptionsChain(symbol, expiration);
    const quote = await tradierService.getQuote(symbol);
    
    res.json({
      success: true,
      symbol,
      expiration: expiration || 'nearest',
      underlyingPrice: quote.last,
      options: chain,
      count: chain.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`Options chain error for ${req.params.symbol}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.params.symbol 
    });
  }
});

// Get expiration dates
router.get('/options/expirations/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const tradierService = require('../services/tradierService');
    
    const expirations = await tradierService.getOptionExpirations(symbol);
    
    res.json({
      success: true,
      symbol,
      expirations,
      count: expirations.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`Expirations error for ${req.params.symbol}:`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      symbol: req.params.symbol 
    });
  }
});

// ====== STATUS ENDPOINTS ======

// API status
router.get('/status', (req, res) => {
  const tradierService = require('../services/tradierService');
  
  res.json({
    success: true,
    service: 'Options Analysis API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    tradierMode: process.env.TRADIER_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUCTION',
    apiKeyConfigured: process.env.TRADIER_API_KEY !== 'your_tradier_api_key_here',
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// System health
router.get('/health/detailed', (req, res) => {
  const health = {
    status: 'healthy',
    checks: {
      api: { status: 'healthy', responseTime: Date.now() - req.startTime },
      memory: { 
        status: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal < 0.8 ? 'healthy' : 'warning',
        usage: `${Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100} MB`
      },
      uptime: { status: 'healthy', seconds: process.uptime() }
    },
    timestamp: new Date().toISOString()
  };
  
  res.json(health);
});

// ====== WEBSOCKET ENDPOINTS ======

// WebSocket connection info
router.get('/websocket/info', (req, res) => {
  const io = req.app.get('socketio');
  
  if (!io) {
    return res.status(503).json({
      success: false,
      error: 'WebSocket server not available'
    });
  }
  
  const clients = Array.from(io.sockets.sockets.values()).map(socket => ({
    id: socket.id,
    rooms: Array.from(socket.rooms)
  }));
  
  res.json({
    success: true,
    enabled: process.env.WS_ENABLED === 'true',
    connectedClients: clients.length,
    clients: clients.slice(0, 10), // First 10 clients
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
