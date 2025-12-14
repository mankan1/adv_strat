const axios = require('axios');
const { EventEmitter } = require('events');

class TradierService extends EventEmitter {
  constructor() {
    super();
    this.baseURL = process.env.TRADIER_API_BASE_URL || 'https://api.tradier.com/v1';
    this.apiKey = process.env.TRADIER_API_KEY;
    this.isSandbox = process.env.TRADIER_SANDBOX === 'true';
    this.accountId = process.env.TRADIER_ACCOUNT_ID;
    
    // Rate limiting
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.maxRequestsPerMinute = this.isSandbox ? 60 : 120; // Tradier limits
    this.requestTimestamps = [];
    
    // Cache
    this.cache = new Map();
    this.cacheTTL = parseInt(process.env.CACHE_TTL_SECONDS) || 300;
    
    this.headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Accept': 'application/json',
      'User-Agent': 'OptionsAnalysisPlatform/1.0'
    };
    
    console.log(`📡 Tradier Service initialized: ${this.isSandbox ? 'SANDBOX' : 'PRODUCTION'}`);
  }

  async makeRequest(endpoint, params = {}) {
    await this.checkRateLimit();
    
    try {
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        headers: this.headers,
        params,
        timeout: 10000
      });
      
      this.recordRequest();
      return response.data;
      
    } catch (error) {
      console.error(`Tradier API Error (${endpoint}):`, {
        status: error.response?.status,
        message: error.message,
        params
      });
      
      if (error.response?.status === 401) {
        throw new Error('Invalid Tradier API key. Please check your .env file.');
      } else if (error.response?.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a minute.');
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout. The Tradier API is not responding.');
      }
      
      throw error;
    }
  }

  async checkRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(t => t > oneMinuteAgo);
    
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requestTimestamps[0];
      const waitTime = 60000 - (now - oldestRequest);
      
      console.log(`⏳ Rate limit reached. Waiting ${Math.ceil(waitTime/1000)} seconds...`);
      await new Promise(resolve => setTimeout(resolve, waitTime + 1000));
    }
  }

  recordRequest() {
    this.requestTimestamps.push(Date.now());
  }

  getCacheKey(endpoint, params) {
    return `${endpoint}:${JSON.stringify(params)}`;
  }

  async getOptionsChain(symbol, expiration = null, greeks = true) {
    console.log('🚀 getOptionsChain() called for symbol:', symbol);
  
    const cacheKey = this.getCacheKey('options-chain', { symbol, expiration });
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL * 1000) {
      return cached.data;
    }
    
    try {
      const params = { 
        symbol, 
        greeks: greeks ? 'true' : 'false'
      };
      
      if (expiration) {
        params.expiration = expiration;
      }
      
      const data = await this.makeRequest('/markets/options/chains', params);
      const options = data?.options?.option || [];
      
      // Enhance options data
      const enhancedOptions = options.map(option => ({
        ...option,
        option_type: option.option_type,
        strike: parseFloat(option.strike),
        last: parseFloat(option.last || 0),
        bid: parseFloat(option.bid || 0),
        ask: parseFloat(option.ask || 0),
        volume: parseInt(option.volume || 0),
        open_interest: parseInt(option.open_interest || 0),
        implied_volatility: parseFloat(option.greeks?.mid_iv || 0),
        delta: parseFloat(option.greeks?.delta || 0),
        gamma: parseFloat(option.greeks?.gamma || 0),
        theta: parseFloat(option.greeks?.theta || 0),
        vega: parseFloat(option.greeks?.vega || 0)
      }));
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: enhancedOptions,
        timestamp: Date.now()
      });
      
      return enhancedOptions;
      
    } catch (error) {
      console.error(`Failed to fetch options chain for ${symbol}:`, error.message);
      throw error;
    }
  }

  async getQuote(symbol) {
    console.log('🚀 getQuote() called for symbol:', symbol);
    console.log('📡 Making REAL Tradier API call for:', symbol);
  
    const cacheKey = this.getCacheKey('quote', { symbol });
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 10000) { // 10 seconds for quotes
      return cached.data;
    }
    
    try {
      const data = await this.makeRequest('/markets/quotes', {
        symbols: symbol,
        greeks: 'false'
      });
      
      const quote = data?.quotes?.quote;
      if (!quote) {
        throw new Error(`No quote data for ${symbol}`);
      }
      
      const formattedQuote = {
        symbol: quote.symbol,
        last: parseFloat(quote.last || 0),
        bid: parseFloat(quote.bid || 0),
        ask: parseFloat(quote.ask || 0),
        change: parseFloat(quote.change || 0),
        change_percentage: parseFloat(quote.change_percentage || 0),
        volume: parseInt(quote.volume || 0),
        average_volume: parseInt(quote.average_volume || 0),
        high: parseFloat(quote.high || 0),
        low: parseFloat(quote.low || 0),
        open: parseFloat(quote.open || 0),
        prev_close: parseFloat(quote.prevclose || 0),
        timestamp: new Date().toISOString()
      };
      
      this.cache.set(cacheKey, {
        data: formattedQuote,
        timestamp: Date.now()
      });
      
      return formattedQuote;
      
    } catch (error) {
      console.error(`Failed to fetch quote for ${symbol}:`, error.message);
      throw error;
    }
  }

  async getTopActiveOptions() {
    try {
      // This is a premium endpoint - using quotes as fallback
      // const symbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN'];
      const symbols =  ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN'];//['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN',//];
        // "SOXS", "OCG", "YCBD", "NVDA", "CGC", "BBAI", "TQQQ", "SOXL", "WOK", "TZA", "PLUG", "SPY", "ASST", "TSLL", "RIVN", "AVGO", "TSLA", "TSLS", "MSOS", "ONDS", "INTC", "TLRY",

        // "ATPC", "SLV", "QQQ", "IQ", "TNYA", "JDST", "XLF", "BEAT", "FRMI", "TE", "KAVL", "IWM", "SQQQ", "ASBP", "ORCL", "SOFI", "VIVK", "BMNR", "PFE", "ZDGE", "DNN", "OPEN", "NFLX",

        // "HPE", "F", "AAL", "PLTD", "IBIT", "ETHA", "TLT", "KVUE", "WBD", "HYG", "QID", "WULF", "UGRO", "MARA", "PLTR", "RR", "BMNU", "BYND", "VALE", "SPDN", "BAC", "UVIX", "AAPL",

        // "LQD", "ACHR", "APLT", "SNAP", "CLSK", "NVD", "BITF", "IVP", "AMD", "FNGD", "NU", "GOGL", "AMZN", "IREN", "IRBT", "RZLT", "CRWV", "BTG", "BITO", "T", "NCI", "CVE", "RIG",

        // "RKLB", "QBTS", "XLE", "NIO", "RWM", "MISL", "HOOD", "CIFR", "PL"];
      const quotes = await Promise.all(
        symbols.map(symbol => this.getQuote(symbol).catch(() => null))
      );
      
      return quotes.filter(Boolean).map(quote => ({
        symbol: quote.symbol,
        last: quote.last,
        change: quote.change,
        volume: quote.volume,
        options_volume: Math.floor(quote.volume * 0.1) // Estimated options volume
      }));
      
    } catch (error) {
      console.error('Failed to fetch top active options:', error);
      return [];
    }
  }

  async getOptionExpirations(symbol) {
    const cacheKey = this.getCacheKey('expirations', { symbol });
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < 3600000) { // 1 hour for expirations
      return cached.data;
    }
    
    try {
      const data = await this.makeRequest('/markets/options/expirations', {
        symbol,
        includeAllRoots: 'false'
      });
      
      const expirations = data?.expirations?.date || [];
      
      // Filter to next 6 expirations
      const now = new Date();
      const futureExpirations = expirations
        .filter(date => new Date(date) > now)
        .slice(0, 6);
      
      this.cache.set(cacheKey, {
        data: futureExpirations,
        timestamp: Date.now()
      });
      
      return futureExpirations;
      
    } catch (error) {
      console.error(`Failed to fetch expirations for ${symbol}:`, error);
      // Return default expirations
      return this.getDefaultExpirations();
    }
  }

  getDefaultExpirations() {
    const dates = [];
    const today = new Date();
    
    for (let i = 1; i <= 6; i++) {
      const date = new Date(today);
      // Find next Friday
      date.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7) + (7 * (i - 1)));
      dates.push(date.toISOString().split('T')[0]);
    }
    
    return dates;
  }

  async getMarketQuotes(symbols) {
    try {
      if (!Array.isArray(symbols)) {
        symbols = [symbols];
      }
      
      // Tradier batch quotes endpoint
      const data = await this.makeRequest('/markets/quotes', {
        symbols: symbols.join(','),
        greeks: 'false'
      });
      
      const quotes = data?.quotes?.quote || [];
      return Array.isArray(quotes) ? quotes : [quotes];
      
    } catch (error) {
      console.error('Failed to fetch market quotes:', error);
      
      // Fallback to individual quotes
      const quotes = [];
      for (const symbol of symbols) {
        try {
          const quote = await this.getQuote(symbol);
          quotes.push(quote);
          await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
        } catch (e) {
          console.error(`Failed to fetch ${symbol}:`, e.message);
        }
      }
      
      return quotes;
    }
  }

  async getHistoricalQuotes(symbol, interval = 'daily', start = null, end = null) {
    console.log('🚀 getHistoricalQuotes() called for symbol:', symbol);
    try {
      if (!start) {
        start = new Date();
        start.setMonth(start.getMonth() - 1); // Default to 1 month
      }
      
      if (!end) {
        end = new Date();
      }
      
      const data = await this.makeRequest('/markets/history', {
        symbol,
        interval,
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
      });
      
      return data?.history?.day || [];
      
    } catch (error) {
      console.error(`Failed to fetch historical data for ${symbol}:`, error);
      return [];
    }
  }

  // For real-time streaming (WebSocket) - requires paid Tradier account
  async getRealTimeQuotes(symbols) {
    if (this.isSandbox) {
      console.warn('⚠️ Real-time streaming not available in sandbox mode');
      return null;
    }
    
    // This would connect to Tradier's WebSocket endpoint
    // Implementation requires paid account
    console.log('📡 Real-time streaming requires paid Tradier account');
    return null;
  }

  async validateAPIKey() {
    try {
      await this.getQuote('SPY');
      return true;
    } catch (error) {
      console.error('Tradier API key validation failed:', error.message);
      return false;
    }
  }
}

module.exports = new TradierService();
