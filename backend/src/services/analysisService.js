const tradierService = require('./tradierService');

class AnalysisService {
  constructor() {
    this.thresholds = {
      volumeSpike: 3.0, // 300% of average volume
      openInterestRatio: 2.0,
      bidAskSpread: 0.20, // 20% max spread
      impliedVolatilityPercentile: 0.8, // Top 20% IV
      sizeThreshold: 1000, // Minimum contract size
      nearMoneyPercent: 0.05 // 5% from current price
    };
    
    this.weights = {
      volume: 0.30,
      openInterest: 0.25,
      spread: 0.15,
      volatility: 0.20,
      moneyness: 0.10
    };
  }

  async scanUnusualActivity(symbol) {
    try {
      console.log(`🔍 Scanning ${symbol} for unusual options activity...`);
      
      // Get current stock price
      const stockQuote = await tradierService.getQuote(symbol);
      const currentPrice = stockQuote.last;
      
      if (!currentPrice || currentPrice <= 0) {
        throw new Error(`Invalid price for ${symbol}: $${currentPrice}`);
      }
      
      // Get nearest expiration
      const expirations = await tradierService.getOptionExpirations(symbol);
      const nearestExpiration = expirations[0];
      
      if (!nearestExpiration) {
        throw new Error(`No expirations found for ${symbol}`);
      }
      
      // Get options chain
      const optionsChain = await tradierService.getOptionsChain(symbol, nearestExpiration);
      
      if (!optionsChain || optionsChain.length === 0) {
        throw new Error(`No options data for ${symbol}`);
      }
      
      // Analyze each option
      const unusualCalls = [];
      const unusualPuts = [];
      const volumeByStrike = new Map();
      
      for (const option of optionsChain) {
        const analysis = this.analyzeSingleOption(option, currentPrice);
        
        if (analysis.isUnusual && analysis.confidence >= 50) {
          if (option.option_type === 'call') {
            unusualCalls.push(analysis);
          } else {
            unusualPuts.push(analysis);
          }
        }
        
        // Track volume by strike for strategy detection
        const strike = option.strike;
        if (!volumeByStrike.has(strike)) {
          volumeByStrike.set(strike, { callVolume: 0, putVolume: 0 });
        }
        
        const strikeData = volumeByStrike.get(strike);
        if (option.option_type === 'call') {
          strikeData.callVolume += option.volume || 0;
        } else {
          strikeData.putVolume += option.volume || 0;
        }
      }
      
      // Sort by confidence
      unusualCalls.sort((a, b) => b.confidence - a.confidence);
      unusualPuts.sort((a, b) => b.confidence - a.confidence);
      
      // Detect strategies
      const strategies = this.detectStrategies(unusualCalls, unusualPuts, volumeByStrike, currentPrice);
      
      return {
        symbol,
        underlyingPrice: currentPrice,
        underlyingChange: stockQuote.change,
        expiration: nearestExpiration,
        calls: unusualCalls.slice(0, 10), // Top 10 unusual calls
        puts: unusualPuts.slice(0, 10),   // Top 10 unusual puts
        strategies: strategies.slice(0, 5), // Top 5 strategies
        scanTime: new Date().toISOString(),
        totalOptionsAnalyzed: optionsChain.length
      };
      
    } catch (error) {
      console.error(`Error scanning ${symbol}:`, error.message);
      throw error;
    }
  }

  analyzeSingleOption(option, underlyingPrice) {
    const analysis = {
      symbol: option.symbol,
      strike: option.strike,
      type: option.option_type,
      expiration: option.expiration_date,
      lastPrice: option.last,
      bid: option.bid,
      ask: option.ask,
      volume: option.volume || 0,
      openInterest: option.open_interest || 0,
      impliedVolatility: option.implied_volatility || 0,
      delta: option.delta || 0,
      theta: option.theta || 0,
      gamma: option.gamma || 0,
      vega: option.vega || 0,
      isUnusual: false,
      confidence: 0,
      scoreComponents: {},
      reasons: [],
      rawData: option
    };
    
    // Calculate individual scores
    const scores = {};
    
    // 1. Volume spike score
    const avgVolume = this.estimateAverageVolume(option);
    scores.volume = this.calculateVolumeScore(option.volume, avgVolume);
    
    // 2. Open Interest ratio score
    scores.openInterest = this.calculateOIScore(option.volume, option.open_interest);
    
    // 3. Bid-Ask spread score
    scores.spread = this.calculateSpreadScore(option.bid, option.ask, option.last);
    
    // 4. Implied Volatility score
    scores.volatility = this.calculateVolatilityScore(option.implied_volatility);
    
    // 5. Moneyness score (how close to current price)
    scores.moneyness = this.calculateMoneynessScore(option.strike, underlyingPrice);
    
    // Calculate weighted confidence
    analysis.confidence = Math.round(
      scores.volume * this.weights.volume +
      scores.openInterest * this.weights.openInterest +
      scores.spread * this.weights.spread +
      scores.volatility * this.weights.volatility +
      scores.moneyness * this.weights.moneyness
    );
    
    analysis.scoreComponents = scores;
    
    // Determine if unusual
    analysis.isUnusual = analysis.confidence >= 50;
    
    // Generate reasons
    if (scores.volume >= 70) {
      analysis.reasons.push(`High volume: ${option.volume.toLocaleString()} contracts`);
    }
    
    if (scores.openInterest >= 70) {
      analysis.reasons.push(`Volume/OI ratio: ${(option.volume / Math.max(option.open_interest, 1)).toFixed(2)}`);
    }
    
    if (scores.moneyness >= 80) {
      const percentFromMoney = Math.abs(option.strike - underlyingPrice) / underlyingPrice;
      if (percentFromMoney < 0.02) {
        analysis.reasons.push('At-the-money');
      } else if (option.strike < underlyingPrice && option.type === 'call') {
        analysis.reasons.push('In-the-money call');
      } else if (option.strike > underlyingPrice && option.type === 'put') {
        analysis.reasons.push('In-the-money put');
      }
    }
    
    if (scores.volatility >= 75) {
      analysis.reasons.push(`High IV: ${(option.implied_volatility * 100).toFixed(1)}%`);
    }
    
    return analysis;
  }

  estimateAverageVolume(option) {
    // Simple estimation - in production, use historical data
    return Math.max(100, (option.open_interest || 1000) * 0.1);
  }

  calculateVolumeScore(volume, avgVolume) {
    if (avgVolume <= 0) return 0;
    
    const ratio = volume / avgVolume;
    if (ratio >= this.thresholds.volumeSpike) return 100;
    if (ratio >= this.thresholds.volumeSpike * 0.5) return 75;
    if (ratio >= this.thresholds.volumeSpike * 0.25) return 50;
    if (volume >= this.thresholds.sizeThreshold) return 25;
    return 0;
  }

  calculateOIScore(volume, openInterest) {
    if (!openInterest || openInterest === 0) return 0;
    
    const ratio = volume / openInterest;
    if (ratio >= this.thresholds.openInterestRatio) return 100;
    if (ratio >= this.thresholds.openInterestRatio * 0.7) return 75;
    if (ratio >= this.thresholds.openInterestRatio * 0.4) return 50;
    return 0;
  }

  calculateSpreadScore(bid, ask, last) {
    if (!bid || !ask || !last || last <= 0) return 50;
    
    const spread = (ask - bid) / last;
    if (spread <= this.thresholds.bidAskSpread * 0.5) return 100;
    if (spread <= this.thresholds.bidAskSpread) return 75;
    if (spread <= this.thresholds.bidAskSpread * 1.5) return 50;
    return 25;
  }

  calculateVolatilityScore(iv) {
    if (!iv || iv <= 0) return 50;
    
    // Simplified - in production, compare to historical IV percentile
    if (iv >= 0.5) return 100;
    if (iv >= 0.4) return 85;
    if (iv >= 0.3) return 70;
    if (iv >= 0.2) return 50;
    return 25;
  }

  calculateMoneynessScore(strike, underlyingPrice) {
    const percentFromMoney = Math.abs(strike - underlyingPrice) / underlyingPrice;
    
    if (percentFromMoney <= this.thresholds.nearMoneyPercent) return 100;
    if (percentFromMoney <= this.thresholds.nearMoneyPercent * 2) return 75;
    if (percentFromMoney <= this.thresholds.nearMoneyPercent * 3) return 50;
    return 25;
  }

  detectStrategies(calls, puts, volumeByStrike, currentPrice) {
    const strategies = [];
    
    // Look for vertical spreads
    const verticalSpreads = this.findVerticalSpreads(calls, puts);
    strategies.push(...verticalSpreads);
    
    // Look for straddles/strangles
    const straddleStrangle = this.findStraddleStrangle(calls, puts, currentPrice);
    if (straddleStrangle) strategies.push(straddleStrangle);
    
    // Look for iron condors
    const ironCondor = this.findIronCondor(calls, puts, currentPrice);
    if (ironCondor) strategies.push(ironCondor);
    
    // Sort by potential profitability
    return strategies.sort((a, b) => b.potentialProfit - a.potentialProfit);
  }

  findVerticalSpreads(calls, puts) {
    const spreads = [];
    
    // Call spreads
    for (let i = 0; i < calls.length; i++) {
      for (let j = i + 1; j < calls.length; j++) {
        const call1 = calls[i];
        const call2 = calls[j];
        const strikeDiff = Math.abs(call1.strike - call2.strike);
        
        if (strikeDiff <= 20 && strikeDiff >= 5) {
          const isBullSpread = call1.strike < call2.strike;
          spreads.push({
            type: 'VERTICAL_SPREAD',
            name: isBullSpread ? 'Bull Call Spread' : 'Bear Call Spread',
            legs: [call1, call2],
            maxProfit: this.calculateVerticalSpreadProfit(call1, call2, isBullSpread),
            maxLoss: this.calculateVerticalSpreadLoss(call1, call2, isBullSpread),
            breakeven: this.calculateVerticalSpreadBreakeven(call1, call2, isBullSpread),
            probability: Math.round((isBullSpread ? call1.confidence : 100 - call1.confidence)),
            description: `${isBullSpread ? 'Bullish' : 'Bearish'} strategy with defined risk`
          });
        }
      }
    }
    
    return spreads.slice(0, 3); // Return top 3
  }

  calculateVerticalSpreadProfit(leg1, leg2, isBullSpread) {
    const width = Math.abs(leg1.strike - leg2.strike);
    const netPremium = Math.abs(leg1.lastPrice - leg2.lastPrice);
    return (width - netPremium).toFixed(2);
  }

  findStraddleStrangle(calls, puts, currentPrice) {
    // Look for near-the-money options
    const nearMoneyCalls = calls.filter(c => 
      Math.abs(c.strike - currentPrice) / currentPrice <= 0.02
    );
    
    const nearMoneyPuts = puts.filter(p => 
      Math.abs(p.strike - currentPrice) / currentPrice <= 0.02
    );
    
    if (nearMoneyCalls.length > 0 && nearMoneyPuts.length > 0) {
      const call = nearMoneyCalls[0];
      const put = nearMoneyPuts[0];
      
      // Check if same strike (straddle) or different (strangle)
      const isStraddle = Math.abs(call.strike - put.strike) < 0.01;
      
      return {
        type: isStraddle ? 'STRADDLE' : 'STRANGLE',
        name: isStraddle ? 'Long Straddle' : 'Long Strangle',
        legs: [call, put],
        cost: (call.lastPrice + put.lastPrice).toFixed(2),
        breakevens: [
          (call.strike + parseFloat(call.lastPrice) + parseFloat(put.lastPrice)).toFixed(2),
          (put.strike - parseFloat(call.lastPrice) - parseFloat(put.lastPrice)).toFixed(2)
        ],
        probability: 35,
        description: 'Volatility play expecting large price move'
      };
    }
    
    return null;
  }

  findIronCondor(calls, puts, currentPrice) {
    // Need OTM puts and OTM calls
    const otmPuts = puts.filter(p => p.strike < currentPrice * 0.95);
    const otmCalls = calls.filter(c => c.strike > currentPrice * 1.05);
    
    if (otmPuts.length >= 2 && otmCalls.length >= 2) {
      // Sort by strike
      const sortedPuts = otmPuts.sort((a, b) => b.strike - a.strike); // Higher strike first
      const sortedCalls = otmCalls.sort((a, b) => a.strike - b.strike); // Lower strike first
      
      if (sortedPuts[0].strike < sortedCalls[0].strike) {
        return {
          type: 'IRON_CONDOR',
          name: 'Iron Condor',
          legs: [sortedPuts[0], sortedPuts[1], sortedCalls[0], sortedCalls[1]],
          maxProfit: this.calculateIronCondorProfit(sortedPuts, sortedCalls),
          maxLoss: this.calculateIronCondorLoss(sortedPuts, sortedCalls),
          probability: 65,
          description: 'Neutral strategy for range-bound markets'
        };
      }
    }
    
    return null;
  }

  calculateIronCondorProfit(puts, calls) {
    // Simplified calculation
    const putCredit = puts[0].lastPrice - puts[1].lastPrice;
    const callCredit = calls[0].lastPrice - calls[1].lastPrice;
    return (putCredit + callCredit).toFixed(2);
  }

  async getMarketSentiment() {
    try {
      const symbols = ['SPY', 'QQQ', 'IWM', 'DIA'];
      const quotes = await Promise.all(
        symbols.map(s => tradierService.getQuote(s).catch(() => null))
      );
      
      const validQuotes = quotes.filter(Boolean);
      const bullishCount = validQuotes.filter(q => q.change > 0).length;
      const bearishCount = validQuotes.filter(q => q.change < 0).length;
      
      if (bullishCount > bearishCount * 1.5) return 'BULLISH';
      if (bearishCount > bullishCount * 1.5) return 'BEARISH';
      return 'NEUTRAL';
      
    } catch (error) {
      console.error('Error getting market sentiment:', error);
      return 'NEUTRAL';
    }
  }
}

module.exports = new AnalysisService();
