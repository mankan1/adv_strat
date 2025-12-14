// src/services/tradierService.js
const axios = require('axios');
const NodeCache = require('node-cache');

class TradierService {
  constructor() {
    this.apiKey = process.env.TRADIER_API_KEY || 'your_tradier_api_key_here';
    this.baseUrl = process.env.TRADIER_SANDBOX === 'true' 
      ? 'https://sandbox.tradier.com/v1' 
      : 'https://api.tradier.com/v1';
    
    // Cache to avoid rate limiting (5 minutes)
    this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
    
    console.log(`📡 Tradier Service initialized: ${process.env.TRADIER_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUCTION'}`);
  }

  async makeRequest(endpoint, params = {}) {
    const cacheKey = `${endpoint}:${JSON.stringify(params)}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) {
      console.log(`🔄 Using cached data for ${endpoint}`);
      return cached;
    }
    
    try {
      console.log(`📡 Making REAL Tradier API call to ${endpoint}`);
      
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        params,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });
      
      const data = response.data;
      
      // Cache successful response
      this.cache.set(cacheKey, data);
      
      return data;
      
    } catch (error) {
      console.error(`❌ Tradier API error for ${endpoint}:`, error.message);
      
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      
      throw new Error(`Tradier API failed: ${error.message}`);
    }
  }

  // Get real-time quote
  async getQuote(symbol) {
    try {
      const data = await this.makeRequest('/markets/quotes', {
        symbols: symbol,
        greeks: 'true'
      });
      
      if (!data.quotes || !data.quotes.quote) {
        throw new Error(`No quote data for ${symbol}`);
      }
      
      const quote = data.quotes.quote;
      
      // Handle single quote vs array
      const quoteData = Array.isArray(quote) ? quote[0] : quote;
      
      return {
        symbol: quoteData.symbol,
        last: parseFloat(quoteData.last) || 0,
        change: parseFloat(quoteData.change) || 0,
        change_percentage: parseFloat(quoteData.change_percentage) || 0,
        volume: parseInt(quoteData.volume) || 0,
        high: parseFloat(quoteData.high) || 0,
        low: parseFloat(quoteData.low) || 0,
        open: parseFloat(quoteData.open) || 0,
        prevclose: parseFloat(quoteData.prevclose) || 0,
        bid: parseFloat(quoteData.bid) || 0,
        ask: parseFloat(quoteData.ask) || 0,
        bidsize: parseInt(quoteData.bidsize) || 0,
        asksize: parseInt(quoteData.asksize) || 0,
        greeks: {
          delta: parseFloat(quoteData.greeks?.delta) || 0,
          gamma: parseFloat(quoteData.greeks?.gamma) || 0,
          theta: parseFloat(quoteData.greeks?.theta) || 0,
          vega: parseFloat(quoteData.greeks?.vega) || 0,
          rho: parseFloat(quoteData.greeks?.rho) || 0,
          phi: parseFloat(quoteData.greeks?.phi) || 0,
          iv: parseFloat(quoteData.greeks?.smv_vol) || 0
        }
      };
      
    } catch (error) {
      console.error(`Error getting quote for ${symbol}:`, error.message);
      throw error;
    }
  }

  async getOptionsChain(symbol, expiration = null) {
    try {
      console.log(`🔗 Getting options chain for ${symbol}`);
      
      // Get expiration dates first
      let actualExpiration = expiration;
      if (!actualExpiration) {
        const expirations = await this.getOptionExpirations(symbol);
        if (expirations && expirations.length > 0) {
          actualExpiration = expirations[0]; // Use nearest expiration
          console.log(`   Using expiration: ${actualExpiration}`);
        } else {
          // Fallback: use next Friday
          actualExpiration = this.getNextFriday();
          console.log(`   Using fallback expiration: ${actualExpiration}`);
        }
      }
      
      if (!actualExpiration) {
        throw new Error('No expiration date available');
      }
      
      const data = await this.makeRequest('/markets/options/chains', {
        symbol,
        expiration: actualExpiration,
        greeks: 'false'
      });
      
      if (!data.options || !data.options.option) {
        console.log(`   No options data for ${symbol} on ${actualExpiration}`);
        return [];
      }
      
      const options = Array.isArray(data.options.option) 
        ? data.options.option 
        : [data.options.option];
      
      console.log(`   Found ${options.length} options`);
      
      return options.map(opt => ({
        symbol: opt.symbol,
        type: opt.option_type,
        strike: parseFloat(opt.strike),
        bid: parseFloat(opt.bid) || 0,
        ask: parseFloat(opt.ask) || 0,
        last: parseFloat(opt.last) || 0,
        volume: parseInt(opt.volume) || 0,
        open_interest: parseInt(opt.open_interest) || 0,
        expiration: opt.expiration_date,
        days_to_expiration: parseInt(opt.days_to_expiration) || 0,
        in_the_money: opt.in_the_money === 'true'
      }));
      
    } catch (error) {
      console.error(`Error getting options chain for ${symbol}:`, error.message);
      
      // Don't throw, return empty array
      return [];
    }
  }
  
  // Also update getOptionExpirations to handle errors better
  async getOptionExpirations(symbol) {
    try {
      console.log(`📅 Getting expirations for ${symbol}`);
      
      const data = await this.makeRequest('/markets/options/expirations', { 
        symbol,
        includeAllRoots: 'true'
      });
      
      if (!data.expirations || !data.expirations.date) {
        console.log(`   No expiration data from API, using fallback`);
        return this.generateDefaultExpirations();
      }
      
      const dates = Array.isArray(data.expirations.date) 
        ? data.expirations.date 
        : [data.expirations.date];
      
      const sortedDates = dates.sort();
      console.log(`   Found ${sortedDates.length} expirations:`, sortedDates.slice(0, 3));
      
      return sortedDates;
      
    } catch (error) {
      console.error(`Error getting expirations for ${symbol}:`, error.message);
      console.log(`   Using default expirations`);
      return this.generateDefaultExpirations();
    }
  }
  
  // Add this helper method if not exists
  generateDefaultExpirations() {
    const expirations = [];
    const today = new Date();
    
    // Generate next 4 Fridays
    for (let i = 1; i <= 4; i++) {
      const date = new Date(today);
      const daysUntilFriday = (5 - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + daysUntilFriday + (i - 1) * 7);
      expirations.push(date.toISOString().split('T')[0]);
    }
    
    return expirations;
  }
  
  getNextFriday() {
    const today = new Date();
    const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7;
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + daysUntilFriday);
    return nextFriday.toISOString().split('T')[0];
  }
  
  // Get options chain
  // async getOptionsChain(symbol, expiration = null) {
  //   try {
  //     const params = {
  //       symbol,
  //       greeks: 'true'
  //     };
      
  //     if (expiration) {
  //       params.expiration = expiration;
  //     }
      
  //     const data = await this.makeRequest('/markets/options/chains', params);
      
  //     if (!data.options || !data.options.option) {
  //       return [];
  //     }
      
  //     const options = Array.isArray(data.options.option) 
  //       ? data.options.option 
  //       : [data.options.option];
      
  //     return options.map(opt => ({
  //       symbol: opt.symbol,
  //       type: opt.option_type,
  //       strike: parseFloat(opt.strike),
  //       bid: parseFloat(opt.bid),
  //       ask: parseFloat(opt.ask),
  //       last: parseFloat(opt.last),
  //       volume: parseInt(opt.volume) || 0,
  //       open_interest: parseInt(opt.open_interest) || 0,
  //       expiration: opt.expiration_date,
  //       days_to_expiration: parseInt(opt.days_to_expiration) || 0,
  //       iv: parseFloat(opt.greeks?.smv_vol) || 0,
  //       delta: parseFloat(opt.greeks?.delta) || 0,
  //       gamma: parseFloat(opt.greeks?.gamma) || 0,
  //       theta: parseFloat(opt.greeks?.theta) || 0,
  //       vega: parseFloat(opt.greeks?.vega) || 0,
  //       in_the_money: opt.in_the_money === 'true'
  //     }));
      
  //   } catch (error) {
  //     console.error(`Error getting options chain for ${symbol}:`, error.message);
  //     return [];
  //   }
  // }

  // // Get option expirations
  // async getOptionExpirations(symbol) {
  //   try {
  //     const data = await this.makeRequest('/markets/options/expirations', { symbol });
      
  //     if (!data.expirations || !data.expirations.date) {
  //       return [];
  //     }
      
  //     const dates = Array.isArray(data.expirations.date) 
  //       ? data.expirations.date 
  //       : [data.expirations.date];
      
  //     return dates.sort();
      
  //   } catch (error) {
  //     console.error(`Error getting expirations for ${symbol}:`, error.message);
      
  //     // Fallback: generate next 4 Fridays
  //     const today = new Date();
  //     const expirations = [];
      
  //     for (let i = 1; i <= 4; i++) {
  //       const date = new Date(today);
  //       // Find next Friday
  //       const daysUntilFriday = (5 - date.getDay() + 7) % 7 || 7;
  //       date.setDate(date.getDate() + daysUntilFriday + (i - 1) * 7);
        
  //       expirations.push(date.toISOString().split('T')[0]);
  //     }
      
  //     return expirations;
  //   }
  // }

  // Get market overview (multiple quotes at once)
  async getMarketOverview() {
    try {
      const symbols = ['SPY', 'QQQ', 'DIA', 'IWM', 'VIX'];
      const quotes = [];
      
      // Get all quotes in parallel
      const quotePromises = symbols.map(symbol => this.getQuote(symbol));
      const results = await Promise.allSettled(quotePromises);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          quotes.push(result.value);
        } else {
          console.error(`Failed to fetch ${symbols[index]}:`, result.reason);
        }
      });
      
      return quotes;
      
    } catch (error) {
      console.error('Error getting market overview:', error.message);
      throw error;
    }
  }

  // Get time & sales (for volume analysis)
  async getTimeSales(symbol, interval = 'tick') {
    try {
      const data = await this.makeRequest('/markets/timesales', {
        symbol,
        interval,
        start: new Date(Date.now() - 3600000).toISOString(), // Last hour
        end: new Date().toISOString()
      });
      
      if (!data.series || !data.series.data) {
        return [];
      }
      
      return data.series.data;
      
    } catch (error) {
      console.error(`Error getting time & sales for ${symbol}:`, error.message);
      return [];
    }
  }
}

// Create singleton instance
const tradierService = new TradierService();

// Export functions for backward compatibility
module.exports = {
  getQuote: (symbol) => tradierService.getQuote(symbol),
  getOptionsChain: (symbol, expiration) => tradierService.getOptionsChain(symbol, expiration),
  getOptionExpirations: (symbol) => tradierService.getOptionExpirations(symbol),
  getMarketOverview: () => tradierService.getMarketOverview(),
  getTimeSales: (symbol, interval) => tradierService.getTimeSales(symbol, interval),
  
  // For testing
  _instance: tradierService
};
