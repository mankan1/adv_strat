const tradierService = require('./tradierService');
const { EventEmitter } = require('events');

class MarketDataService extends EventEmitter {
  constructor() {
    super();
    this.marketIndices = {
      'SPX': { price: 0, change: 0 },
      'NDX': { price: 0, change: 0 },
      'DOW': { price: 0, change: 0 },
      'RUT': { price: 0, change: 0 },
      'VIX': { price: 0, change: 0 }
    };
    
    this.updateInterval = 60000; // 1 minute
    this.isUpdating = false;
    
    this.startUpdates();
  }

  async startUpdates() {
    await this.updateMarketData();
    
    setInterval(async () => {
      if (!this.isUpdating) {
        await this.updateMarketData();
      }
    }, this.updateInterval);
  }

  async updateMarketData() {
    try {
      this.isUpdating = true;
      
      const indices = Object.keys(this.marketIndices);
      for (const symbol of indices) {
        try {
          const quote = await tradierService.getQuote(symbol);
          if (quote) {
            this.marketIndices[symbol] = {
              price: quote.last,
              change: quote.change,
              changePercent: quote.change_percentage,
              volume: quote.volume,
              timestamp: new Date().toISOString()
            };
            
            // Emit update
            this.emit('market-update', {
              symbol,
              ...this.marketIndices[symbol]
            });
          }
        } catch (error) {
          console.error(`Failed to update ${symbol}:`, error.message);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Calculate overall market sentiment
      const sentiment = this.calculateMarketSentiment();
      this.emit('sentiment-update', sentiment);
      
    } catch (error) {
      console.error('Market data update error:', error);
    } finally {
      this.isUpdating = false;
    }
  }

  calculateMarketSentiment() {
    const changes = Object.values(this.marketIndices)
      .filter(data => data.change !== undefined)
      .map(data => data.change);
    
    if (changes.length === 0) return 'NEUTRAL';
    
    const positiveChanges = changes.filter(change => change > 0).length;
    const negativeChanges = changes.filter(change => change < 0).length;
    const totalChanges = changes.length;
    
    const bullishRatio = positiveChanges / totalChanges;
    const bearishRatio = negativeChanges / totalChanges;
    
    if (bullishRatio > 0.7) return 'STRONGLY_BULLISH';
    if (bullishRatio > 0.6) return 'BULLISH';
    if (bearishRatio > 0.7) return 'STRONGLY_BEARISH';
    if (bearishRatio > 0.6) return 'BEARISH';
    return 'NEUTRAL';
  }

  getMarketData() {
    return {
      indices: this.marketIndices,
      sentiment: this.calculateMarketSentiment(),
      lastUpdated: new Date().toISOString()
    };
  }

  async getSectorPerformance() {
    try {
      const sectorETFs = {
        'XLK': 'Technology',
        'XLY': 'Consumer Discretionary',
        'XLP': 'Consumer Staples',
        'XLE': 'Energy',
        'XLF': 'Financials',
        'XLV': 'Healthcare',
        'XLI': 'Industrials',
        'XLB': 'Materials',
        'XLU': 'Utilities',
        'XLRE': 'Real Estate'
      };
      
      const sectorData = {};
      const symbols = Object.keys(sectorETFs);
      
      for (const symbol of symbols) {
        try {
          const quote = await tradierService.getQuote(symbol);
          if (quote) {
            sectorData[sectorETFs[symbol]] = {
              symbol,
              price: quote.last,
              change: quote.change,
              changePercent: quote.change_percentage
            };
          }
        } catch (error) {
          console.error(`Failed to fetch ${symbol}:`, error.message);
        }
        
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Sort by performance
      const sortedSectors = Object.entries(sectorData)
        .sort(([, a], [, b]) => b.changePercent - a.changePercent)
        .reduce((obj, [key, value]) => {
          obj[key] = value;
          return obj;
        }, {});
      
      return sortedSectors;
      
    } catch (error) {
      console.error('Failed to get sector performance:', error);
      return {};
    }
  }

  async getMostActive(optionsOnly = false) {
    try {
      // For options, we would need premium Tradier data
      // Using stock most active as proxy
      const activeStocks =  ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN'];
      
      // [
      //   // 'AAPL', 'TSLA', 'NVDA', 'AMD', 'NIO',
      //   // 'SPY', 'QQQ', 'IWM', 'TLT', 'GLD'
      // 'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN',//      ];  
      // "SOXS", "OCG", "YCBD", "NVDA", "CGC", "BBAI", "TQQQ", "SOXL", "WOK", "TZA", "PLUG", "SPY", "ASST", "TSLL", "RIVN", "AVGO", "TSLA", "TSLS", "MSOS", "ONDS", "INTC", "TLRY",

      // "ATPC", "SLV", "QQQ", "IQ", "TNYA", "JDST", "XLF", "BEAT", "FRMI", "TE", "KAVL", "IWM", "SQQQ", "ASBP", "ORCL", "SOFI", "VIVK", "BMNR", "PFE", "ZDGE", "DNN", "OPEN", "NFLX",

      // "HPE", "F", "AAL", "PLTD", "IBIT", "ETHA", "TLT", "KVUE", "WBD", "HYG", "QID", "WULF", "UGRO", "MARA", "PLTR", "RR", "BMNU", "BYND", "VALE", "SPDN", "BAC", "UVIX", "AAPL",

      // "LQD", "ACHR", "APLT", "SNAP", "CLSK", "NVD", "BITF", "IVP", "AMD", "FNGD", "NU", "GOGL", "AMZN", "IREN", "IRBT", "RZLT", "CRWV", "BTG", "BITO", "T", "NCI", "CVE", "RIG",

      // "RKLB", "QBTS", "XLE", "NIO", "RWM", "MISL", "HOOD", "CIFR", "PL",        
      // ];
      
      const quotes = await Promise.all(
        activeStocks.map(symbol => 
          tradierService.getQuote(symbol).catch(() => null)
        )
      );
      
      return quotes
        .filter(Boolean)
        .map(quote => ({
          symbol: quote.symbol,
          last: quote.last,
          change: quote.change,
          volume: quote.volume,
          optionsVolume: Math.floor(quote.volume * 0.15) // Estimate
        }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 10);
        
    } catch (error) {
      console.error('Failed to get most active:', error);
      return [];
    }
  }
}

module.exports = new MarketDataService();
