import React, { useState, useEffect } from 'react';
import './AdvancedTrading.css';

const AdvancedTrading = () => {
  const [symbol, setSymbol] = useState('SPY');
  const [strategy, setStrategy] = useState('vertical-spread');
  const [position, setPosition] = useState('debit');
  const [legs, setLegs] = useState([
    { id: 1, type: 'call', position: 'long', strike: 0, quantity: 1, premium: 0, expiration: '' },
    { id: 2, type: 'call', position: 'short', strike: 0, quantity: 1, premium: 0, expiration: '' }
  ]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expirations, setExpirations] = useState([]);
  const [quote, setQuote] = useState(null);
  const [optionsChain, setOptionsChain] = useState([]);

  // Available strategies
  const strategies = [
    { id: 'vertical-spread', name: 'Vertical Spread', icon: '⬆️⬇️', legs: 2 },
    { id: 'iron-condor', name: 'Iron Condor', icon: '🦅', legs: 4 },
    { id: 'strangle', name: 'Strangle', icon: '⚡', legs: 2 },
    { id: 'straddle', name: 'Straddle', icon: '⚖️', legs: 2 },
    { id: 'butterfly', name: 'Butterfly', icon: '🦋', legs: 3 },
    { id: 'calendar-spread', name: 'Calendar Spread', icon: '📅', legs: 2 },
    { id: 'diagonal-spread', name: 'Diagonal Spread', icon: '↗️', legs: 2 },
    { id: 'custom', name: 'Custom Strategy', icon: '⚙️', legs: 4 }
  ];

  // Strategy templates
  const strategyTemplates = {
    'vertical-spread': {
      name: 'Bull Call Spread',
      legs: [
        { type: 'call', position: 'long', description: 'Buy lower strike call' },
        { type: 'call', position: 'short', description: 'Sell higher strike call' }
      ],
      description: 'Bullish directional play with limited risk'
    },
    'iron-condor': {
      name: 'Iron Condor',
      legs: [
        { type: 'put', position: 'short', description: 'Sell OTM put' },
        { type: 'put', position: 'long', description: 'Buy further OTM put' },
        { type: 'call', position: 'short', description: 'Sell OTM call' },
        { type: 'call', position: 'long', description: 'Buy further OTM call' }
      ],
      description: 'Non-directional premium collection'
    },
    'strangle': {
      name: 'Strangle',
      legs: [
        { type: 'put', position: 'long', description: 'Buy OTM put' },
        { type: 'call', position: 'long', description: 'Buy OTM call' }
      ],
      description: 'Volatility play - expecting big move'
    },
    'straddle': {
      name: 'Straddle',
      legs: [
        { type: 'put', position: 'long', description: 'Buy ATM put' },
        { type: 'call', position: 'long', description: 'Buy ATM call' }
      ],
      description: 'Volatility play at current price'
    },
    'butterfly': {
      name: 'Butterfly Spread',
      legs: [
        { type: 'call', position: 'long', description: 'Buy lower strike call' },
        { type: 'call', position: 'short', quantity: 2, description: 'Sell 2 ATM calls' },
        { type: 'call', position: 'long', description: 'Buy higher strike call' }
      ],
      description: 'Limited risk, high probability'
    }
  };

  // Fetch initial data
  useEffect(() => {
    if (symbol) {
      fetchQuote();
      fetchExpirations();
    }
  }, [symbol]);

  useEffect(() => {
    if (expirations.length > 0) {
      const nearestExp = expirations[0];
      legs.forEach(leg => {
        if (!leg.expiration) {
          updateLeg(leg.id, 'expiration', nearestExp);
        }
      });
      fetchOptionsChain(nearestExp);
    }
  }, [expirations]);

  // Auto-populate strikes when quote changes
  useEffect(() => {
    if (quote && quote.last) {
      const currentPrice = quote.last;
      
      switch(strategy) {
        case 'vertical-spread':
          setLegs([
            { ...legs[0], strike: Math.round(currentPrice * 0.98) },
            { ...legs[1], strike: Math.round(currentPrice * 1.02) }
          ]);
          break;
        case 'iron-condor':
          setLegs([
            { ...legs[0], strike: Math.round(currentPrice * 0.95), type: 'put', position: 'short' },
            { ...legs[1], strike: Math.round(currentPrice * 0.90), type: 'put', position: 'long' },
            { ...legs[2], strike: Math.round(currentPrice * 1.05), type: 'call', position: 'short' },
            { ...legs[3], strike: Math.round(currentPrice * 1.10), type: 'call', position: 'long' }
          ]);
          break;
        case 'strangle':
          setLegs([
            { ...legs[0], strike: Math.round(currentPrice * 0.90), type: 'put', position: 'long' },
            { ...legs[1], strike: Math.round(currentPrice * 1.10), type: 'call', position: 'long' }
          ]);
          break;
      }
    }
  }, [quote, strategy]);

  // API Functions
  const fetchQuote = async () => {
    try {
      const response = await fetch(`http://localhost:5000/market/quote/${symbol}`);
      const data = await response.json();
      if (data.success) {
        setQuote(data);
      }
    } catch (error) {
      console.error('Error fetching quote:', error);
    }
  };

  const fetchExpirations = async () => {
    try {
      const response = await fetch(`http://localhost:5000/options/expirations/${symbol}`);
      const data = await response.json();
      if (data.success) {
        setExpirations(data.expirations || []);
      }
    } catch (error) {
      console.error('Error fetching expirations:', error);
    }
  };

  const fetchOptionsChain = async (expiration) => {
    try {
      const response = await fetch(`http://localhost:5000/options/chain/${symbol}?expiration=${expiration}`);
      const data = await response.json();
      if (data.success) {
        setOptionsChain(data.options || []);
      }
    } catch (error) {
      console.error('Error fetching options chain:', error);
    }
  };

  const updateLeg = (id, field, value) => {
    setLegs(legs.map(leg => 
      leg.id === id ? { ...leg, [field]: value } : leg
    ));
  };

  const addLeg = () => {
    const newId = Math.max(...legs.map(l => l.id)) + 1;
    setLegs([...legs, {
      id: newId,
      type: 'call',
      position: 'long',
      strike: quote?.last || 0,
      quantity: 1,
      premium: 0,
      expiration: expirations[0] || ''
    }]);
  };

  const removeLeg = (id) => {
    if (legs.length > 1) {
      setLegs(legs.filter(leg => leg.id !== id));
    }
  };

  const calculateStrategy = async () => {
    setLoading(true);
    try {
      // First, get premium data for each leg
      const legsWithPremiums = await Promise.all(
        legs.map(async (leg) => {
          if (optionsChain.length > 0) {
            // Find the option in the chain
            const option = optionsChain.find(o => 
              o.type === leg.type && 
              o.strike === leg.strike &&
              o.expiration === leg.expiration
            );
            
            if (option) {
              const midPrice = (option.bid + option.ask) / 2;
              return {
                ...leg,
                premium: midPrice,
                bid: option.bid,
                ask: option.ask,
                delta: option.delta,
                gamma: option.gamma,
                theta: option.theta,
                vega: option.vega,
                iv: option.iv
              };
            }
          }
          return leg;
        })
      );

      // Calculate strategy metrics
      let netPremium = 0;
      let maxProfit = 0;
      let maxLoss = 0;
      let breakevens = [];
      let totalDelta = 0;
      let totalTheta = 0;
      let totalVega = 0;

      legsWithPremiums.forEach(leg => {
        const legCost = leg.premium * leg.quantity * 100;
        const multiplier = leg.position === 'long' ? -1 : 1;
        
        netPremium += (legCost * multiplier);
        totalDelta += (leg.delta || 0) * leg.quantity * multiplier;
        totalTheta += (leg.theta || 0) * leg.quantity * multiplier;
        totalVega += (leg.vega || 0) * leg.quantity * multiplier;
      });

      // Basic strategy calculations (simplified)
      if (strategy === 'vertical-spread') {
        const longLeg = legsWithPremiums.find(l => l.position === 'long');
        const shortLeg = legsWithPremiums.find(l => l.position === 'short');
        
        if (longLeg && shortLeg) {
          maxLoss = Math.abs(netPremium);
          maxProfit = Math.abs(shortLeg.strike - longLeg.strike) * 100 - maxLoss;
          
          if (longLeg.type === 'call') {
            breakevens = [longLeg.strike + (maxLoss / 100)];
          } else {
            breakevens = [longLeg.strike - (maxLoss / 100)];
          }
        }
      }

      // Generate profit/loss data points
      const plData = generatePLData(legsWithPremiums, quote?.last || 0);

      setAnalysis({
        netPremium: netPremium.toFixed(2),
        maxProfit: maxProfit.toFixed(2),
        maxLoss: maxLoss.toFixed(2),
        breakevens: breakevens.map(b => b.toFixed(2)),
        greeks: {
          delta: totalDelta.toFixed(3),
          theta: totalTheta.toFixed(2),
          vega: totalVega.toFixed(2)
        },
        legs: legsWithPremiums,
        plData,
        probability: calculateProbability(legsWithPremiums, quote?.last || 0),
        riskReward: (maxProfit / Math.abs(maxLoss)).toFixed(2)
      });

    } catch (error) {
      console.error('Error calculating strategy:', error);
    } finally {
      setLoading(false);
    }
  };

  const generatePLData = (legs, currentPrice) => {
    const data = [];
    const priceRange = currentPrice * 0.3; // ±30%
    
    for (let price = currentPrice - priceRange; price <= currentPrice + priceRange; price += priceRange / 20) {
      let totalPL = 0;
      
      legs.forEach(leg => {
        let legPL = 0;
        const multiplier = leg.position === 'long' ? 1 : -1;
        const contractMultiplier = 100;
        
        if (leg.type === 'call') {
          if (price > leg.strike) {
            legPL = (price - leg.strike - leg.premium) * contractMultiplier * multiplier;
          } else {
            legPL = -leg.premium * contractMultiplier * multiplier;
          }
        } else { // put
          if (price < leg.strike) {
            legPL = (leg.strike - price - leg.premium) * contractMultiplier * multiplier;
          } else {
            legPL = -leg.premium * contractMultiplier * multiplier;
          }
        }
        
        totalPL += legPL * leg.quantity;
      });
      
      data.push({ price: price.toFixed(2), pl: totalPL.toFixed(2) });
    }
    
    return data;
  };

  const calculateProbability = (legs, currentPrice) => {
    // Simplified probability calculation
    let prob = 50; // Base 50%
    
    if (strategy === 'vertical-spread') {
      const longLeg = legs.find(l => l.position === 'long');
      const shortLeg = legs.find(l => l.position === 'short');
      
      if (longLeg && shortLeg) {
        if (longLeg.type === 'call') { // Bull spread
          const spreadWidth = shortLeg.strike - longLeg.strike;
          const cost = Math.abs(longLeg.premium - shortLeg.premium);
          prob = 100 - (cost / spreadWidth * 100);
        }
      }
    }
    
    return Math.min(95, Math.max(5, prob)).toFixed(0);
  };

  const applyStrategyTemplate = (strategyId) => {
    setStrategy(strategyId);
    const template = strategyTemplates[strategyId];
    
    if (template) {
      const newLegs = template.legs.map((leg, index) => ({
        id: index + 1,
        type: leg.type,
        position: leg.position,
        strike: 0,
        quantity: leg.quantity || 1,
        premium: 0,
        expiration: expirations[0] || ''
      }));
      
      setLegs(newLegs);
    }
  };

  const saveStrategy = () => {
    const strategyData = {
      symbol,
      strategy,
      position,
      legs,
      analysis,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`savedStrategy_${Date.now()}`, JSON.stringify(strategyData));
    alert('Strategy saved to local storage!');
  };

  return (
    <div className="advanced-trading">
      <div className="trading-header">
        <h2>⚡ Advanced Options Trading</h2>
        <p>Build and analyze complex options strategies using real market data</p>
      </div>

      <div className="trading-container">
        {/* Left Panel - Strategy Builder */}
        <div className="strategy-builder">
          <div className="section">
            <h3>🎯 Select Strategy</h3>
            <div className="strategy-grid">
              {strategies.map(s => (
                <button
                  key={s.id}
                  className={`strategy-btn ${strategy === s.id ? 'active' : ''}`}
                  onClick={() => applyStrategyTemplate(s.id)}
                >
                  <span className="strategy-icon">{s.icon}</span>
                  <span className="strategy-name">{s.name}</span>
                  <span className="strategy-legs">{s.legs} leg{s.legs !== 1 ? 's' : ''}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="section">
            <h3>📊 Underlying Details</h3>
            <div className="underlying-info">
              <div className="symbol-input">
                <label>Symbol:</label>
                <input 
                  type="text" 
                  value={symbol} 
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="e.g., SPY, AAPL, TSLA"
                />
              </div>
              
              {quote && (
                <div className="quote-display">
                  <div className="quote-item">
                    <span>Price:</span>
                    <span className="price">${quote.last}</span>
                  </div>
                  <div className="quote-item">
                    <span>Change:</span>
                    <span className={`change ${quote.change >= 0 ? 'positive' : 'negative'}`}>
                      {quote.change} ({quote.change_percentage}%)
                    </span>
                  </div>
                </div>
              )}

              <div className="expiration-selector">
                <label>Expiration:</label>
                <select 
                  value={legs[0]?.expiration || ''}
                  onChange={(e) => {
                    legs.forEach(leg => updateLeg(leg.id, 'expiration', e.target.value));
                    fetchOptionsChain(e.target.value);
                  }}
                >
                  {expirations.map(exp => (
                    <option key={exp} value={exp}>{exp}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="section">
            <h3>🧩 Strategy Legs ({legs.length})</h3>
            <div className="legs-container">
              {legs.map((leg, index) => (
                <div key={leg.id} className="leg-card">
                  <div className="leg-header">
                    <span className="leg-number">Leg {index + 1}</span>
                    <button 
                      className="remove-leg-btn"
                      onClick={() => removeLeg(leg.id)}
                      disabled={legs.length <= 1}
                    >
                      ✕
                    </button>
                  </div>
                  
                  <div className="leg-controls">
                    <div className="leg-control">
                      <label>Type:</label>
                      <select 
                        value={leg.type}
                        onChange={(e) => updateLeg(leg.id, 'type', e.target.value)}
                      >
                        <option value="call">Call</option>
                        <option value="put">Put</option>
                      </select>
                    </div>
                    
                    <div className="leg-control">
                      <label>Position:</label>
                      <select 
                        value={leg.position}
                        onChange={(e) => updateLeg(leg.id, 'position', e.target.value)}
                      >
                        <option value="long">Long (Buy)</option>
                        <option value="short">Short (Sell)</option>
                      </select>
                    </div>
                    
                    <div className="leg-control">
                      <label>Strike:</label>
                      <input 
                        type="number" 
                        value={leg.strike}
                        onChange={(e) => updateLeg(leg.id, 'strike', parseFloat(e.target.value))}
                        step="0.5"
                      />
                    </div>
                    
                    <div className="leg-control">
                      <label>Quantity:</label>
                      <input 
                        type="number" 
                        value={leg.quantity}
                        onChange={(e) => updateLeg(leg.id, 'quantity', parseInt(e.target.value))}
                        min="1"
                      />
                    </div>
                    
                    {leg.premium > 0 && (
                      <div className="leg-control">
                        <label>Premium:</label>
                        <span className="premium-display">${leg.premium.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              <button className="add-leg-btn" onClick={addLeg}>
                + Add Leg
              </button>
            </div>
          </div>

          <div className="action-buttons">
            <button 
              className="calculate-btn"
              onClick={calculateStrategy}
              disabled={loading}
            >
              {loading ? 'Calculating...' : '📈 Calculate Strategy'}
            </button>
            
            <button className="save-btn" onClick={saveStrategy}>
              💾 Save Strategy
            </button>
            
            <button className="reset-btn" onClick={() => window.location.reload()}>
              🔄 Reset
            </button>
          </div>
        </div>

        {/* Right Panel - Analysis Results */}
        <div className="analysis-panel">
          {analysis ? (
            <>
              <div className="section">
                <h3>📊 Strategy Analysis</h3>
                
                <div className="strategy-metrics">
                  <div className="metric-card large">
                    <div className="metric-label">Net Premium</div>
                    <div className={`metric-value ${analysis.netPremium >= 0 ? 'positive' : 'negative'}`}>
                      ${analysis.netPremium}
                    </div>
                    <div className="metric-desc">{analysis.netPremium >= 0 ? 'Credit Received' : 'Debit Paid'}</div>
                  </div>
                  
                  <div className="metric-card">
                    <div className="metric-label">Max Profit</div>
                    <div className="metric-value positive">${analysis.maxProfit}</div>
                    <div className="metric-desc">Best case scenario</div>
                  </div>
                  
                  <div className="metric-card">
                    <div className="metric-label">Max Loss</div>
                    <div className="metric-value negative">${analysis.maxLoss}</div>
                    <div className="metric-desc">Worst case scenario</div>
                  </div>
                  
                  <div className="metric-card">
                    <div className="metric-label">Risk/Reward</div>
                    <div className="metric-value">{analysis.riskReward}:1</div>
                    <div className="metric-desc">Ratio</div>
                  </div>
                </div>

                <div className="breakeven-section">
                  <h4>🎯 Break-even Points</h4>
                  <div className="breakeven-points">
                    {analysis.breakevens.length > 0 ? (
                      analysis.breakevens.map((point, idx) => (
                        <div key={idx} className="breakeven-point">
                          <span className="point-label">BE{analysis.breakevens.length > 1 ? idx + 1 : ''}:</span>
                          <span className="point-value">${point}</span>
                        </div>
                      ))
                    ) : (
                      <div className="no-breakeven">No single break-even point</div>
                    )}
                  </div>
                </div>

                <div className="greeks-section">
                  <h4>𝛿 Option Greeks</h4>
                  <div className="greeks-grid">
                    <div className="greek-card">
                      <div className="greek-symbol">Δ</div>
                      <div className="greek-name">Delta</div>
                      <div className="greek-value">{analysis.greeks.delta}</div>
                      <div className="greek-desc">Directional exposure</div>
                    </div>
                    <div className="greek-card">
                      <div className="greek-symbol">Θ</div>
                      <div className="greek-name">Theta</div>
                      <div className="greek-value">{analysis.greeks.theta}</div>
                      <div className="greek-desc">Daily time decay</div>
                    </div>
                    <div className="greek-card">
                      <div className="greek-symbol">ν</div>
                      <div className="greek-name">Vega</div>
                      <div className="greek-value">{analysis.greeks.vega}</div>
                      <div className="greek-desc">Volatility exposure</div>
                    </div>
                    <div className="greek-card">
                      <div className="greek-symbol">P</div>
                      <div className="greek-name">Probability</div>
                      <div className="greek-value">{analysis.probability}%</div>
                      <div className="greek-desc">Profit probability</div>
                    </div>
                  </div>
                </div>

                <div className="pl-chart">
                  <h4>📈 Profit/Loss Diagram</h4>
                  <div className="chart-container">
                    {/* Simple P/L visualization */}
                    <div className="pl-visualization">
                      {analysis.plData && analysis.plData.map((point, idx) => {
                        const height = Math.abs(point.pl / Math.max(...analysis.plData.map(p => Math.abs(p.pl)))) * 100;
                        const isProfit = parseFloat(point.pl) >= 0;
                        
                        return (
                          <div 
                            key={idx}
                            className="pl-bar"
                            style={{ 
                              height: `${height}px`,
                              backgroundColor: isProfit ? '#4CAF50' : '#f44336',
                              opacity: Math.abs(point.price - quote?.last) < (quote?.last * 0.05) ? 1 : 0.3
                            }}
                            title={`Price: $${point.price}, P/L: $${point.pl}`}
                          >
                            {Math.abs(point.price - quote?.last) < (quote?.last * 0.02) && (
                              <div className="current-price-marker">Current</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="pl-legend">
                      <div className="legend-item">
                        <div className="legend-color profit"></div>
                        <span>Profit Zone</span>
                      </div>
                      <div className="legend-item">
                        <div className="legend-color loss"></div>
                        <span>Loss Zone</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="strategy-details">
                  <h4>📋 Leg Details</h4>
                  <table className="legs-table">
                    <thead>
                      <tr>
                        <th>Leg</th>
                        <th>Type</th>
                        <th>Position</th>
                        <th>Strike</th>
                        <th>Qty</th>
                        <th>Premium</th>
                        <th>Δ Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.legs.map((leg, idx) => (
                        <tr key={idx}>
                          <td>{idx + 1}</td>
                          <td className={leg.type === 'call' ? 'call-type' : 'put-type'}>
                            {leg.type.toUpperCase()}
                          </td>
                          <td className={leg.position === 'long' ? 'long-position' : 'short-position'}>
                            {leg.position.toUpperCase()}
                          </td>
                          <td>${leg.strike}</td>
                          <td>{leg.quantity}</td>
                          <td>${leg.premium?.toFixed(2) || '0.00'}</td>
                          <td>{leg.delta?.toFixed(3) || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-analysis">
              <div className="empty-icon">📊</div>
              <h3>No Analysis Yet</h3>
              <p>Configure your strategy and click "Calculate Strategy" to see analysis results.</p>
              <div className="tips">
                <h4>💡 Tips:</h4>
                <ul>
                  <li>Start with a Vertical Spread for beginners</li>
                  <li>Use Iron Condor for neutral market outlook</li>
                  <li>Try Straddle/Strangle for high volatility expectations</li>
                  <li>Adjust strikes based on your risk tolerance</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdvancedTrading;
