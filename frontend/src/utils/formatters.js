import moment from 'moment';
import numeral from 'numeral';

// Number formatting
export const formatCurrency = (value, decimals = 2) => {
  if (value === null || value === undefined) return '$0.00';
  
  const absValue = Math.abs(value);
  let format = '0,0';
  
  if (absValue < 0.01) {
    format = '0.0000';
  } else if (absValue < 0.1) {
    format = '0.000';
  } else if (absValue < 1) {
    format = '0.00';
  } else if (absValue < 10) {
    format = '0.00';
  } else if (absValue < 1000) {
    format = '0,0.00';
  } else if (absValue < 1000000) {
    format = '0,0';
  } else {
    format = '0.0a';
  }
  
  const formatted = numeral(value).format(`$${format}`);
  return value < 0 ? `-${formatted.replace('-', '')}` : formatted;
};

export const formatPercent = (value, decimals = 2) => {
  if (value === null || value === undefined) return '0.00%';
  const formatted = numeral(value / 100).format(`0,0.${'0'.repeat(decimals)}%`);
  return value < 0 ? formatted : `+${formatted}`;
};

export const formatNumber = (value, decimals = 0) => {
  if (value === null || value === undefined) return '0';
  
  const absValue = Math.abs(value);
  let format = '0,0';
  
  if (absValue < 1000) {
    format = `0,0.${'0'.repeat(decimals)}`;
  } else if (absValue < 1000000) {
    format = '0,0';
  } else if (absValue < 1000000000) {
    format = '0.0a';
  } else {
    format = '0.00a';
  }
  
  return numeral(value).format(format);
};

export const formatVolume = (value) => {
  if (value === null || value === undefined) return '0';
  
  if (value >= 1000000) {
    return numeral(value).format('0.0a').toUpperCase();
  } else if (value >= 1000) {
    return numeral(value).format('0.0a').toUpperCase();
  }
  
  return numeral(value).format('0,0');
};

// Date/Time formatting
export const formatDate = (date, format = 'MM/DD/YY') => {
  if (!date) return '';
  return moment(date).format(format);
};

export const formatTime = (date) => {
  if (!date) return '';
  return moment(date).format('h:mm A');
};

export const formatDateTime = (date) => {
  if (!date) return '';
  return moment(date).format('MM/DD/YY h:mm A');
};

export const timeAgo = (date) => {
  if (!date) return '';
  return moment(date).fromNow();
};

export const formatExpiration = (date) => {
  if (!date) return '';
  const days = moment(date).diff(moment(), 'days');
  
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.floor(days / 7)} weeks`;
  
  return moment(date).format('MMM D');
};

// Options formatting
export const formatStrike = (strike) => {
  return formatCurrency(strike, 0);
};

export const formatOptionSymbol = (symbol) => {
  if (!symbol) return '';
  
  // Extract parts from option symbol (e.g., AAPL240119C00185000)
  const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (match) {
    const [, underlying, date, type, strike] = match;
    const expiration = moment(date, 'YYMMDD').format('MMM D');
    const strikePrice = (parseInt(strike) / 1000).toFixed(0);
    return `${underlying} ${expiration} ${type === 'C' ? 'Call' : 'Put'} $${strikePrice}`;
  }
  
  return symbol;
};

export const formatGreek = (value, greek = 'delta') => {
  if (value === null || value === undefined) return '0.00';
  
  const formats = {
    delta: '0.00',
    gamma: '0.000',
    theta: '0.000',
    vega: '0.00',
    iv: '0.0%'
  };
  
  const format = formats[greek] || '0.00';
  
  if (greek === 'iv') {
    return numeral(value).format(format);
  }
  
  return numeral(value).format(format);
};

// Color formatting based on value
export const getColorForValue = (value, type = 'change') => {
  const colors = {
    success: '#4CAF50',
    error: '#F44336',
    warning: '#FF9800',
    neutral: '#9E9E9E'
  };
  
  if (type === 'change') {
    if (value > 0) return colors.success;
    if (value < 0) return colors.error;
    return colors.neutral;
  }
  
  if (type === 'confidence') {
    if (value >= 80) return colors.success;
    if (value >= 60) return '#8BC34A';
    if (value >= 40) return colors.warning;
    return colors.error;
  }
  
  if (type === 'volume') {
    if (value >= 10000) return colors.success;
    if (value >= 5000) return '#8BC34A';
    if (value >= 1000) return colors.warning;
    return colors.neutral;
  }
  
  return colors.neutral;
};

// Sentiment formatting
export const formatSentiment = (sentiment) => {
  const sentiments = {
    'STRONGLY_BULLISH': { text: 'Strongly Bullish', color: '#4CAF50', icon: '📈' },
    'BULLISH': { text: 'Bullish', color: '#8BC34A', icon: '📈' },
    'NEUTRAL': { text: 'Neutral', color: '#FF9800', icon: '➖' },
    'BEARISH': { text: 'Bearish', color: '#FF5722', icon: '📉' },
    'STRONGLY_BEARISH': { text: 'Strongly Bearish', color: '#F44336', icon: '📉' }
  };
  
  return sentiments[sentiment] || sentiments.NEUTRAL;
};

// Strategy formatting
export const formatStrategy = (strategy) => {
  const strategies = {
    'VERTICAL_SPREAD': { name: 'Vertical Spread', description: 'Limited risk directional play' },
    'IRON_CONDOR': { name: 'Iron Condor', description: 'Range-bound neutral strategy' },
    'STRADDLE': { name: 'Straddle', description: 'Volatility play expecting big move' },
    'STRANGLE': { name: 'Strangle', description: 'Cheaper volatility play' },
    'CALENDAR_SPREAD': { name: 'Calendar Spread', description: 'Time decay play' },
    'BUTTERFLY': { name: 'Butterfly', description: 'Low volatility range play' },
    'COVERED_CALL': { name: 'Covered Call', description: 'Income generation strategy' },
    'PROTECTIVE_PUT': { name: 'Protective Put', description: 'Downside protection' }
  };
  
  return strategies[strategy] || { name: strategy, description: 'Custom strategy' };
};

// Calculate option metrics
export const calculateOptionMetrics = (option, underlyingPrice) => {
  if (!option || !underlyingPrice) return {};
  
  const { strike, lastPrice, bid, ask, impliedVolatility } = option;
  
  const percentFromMoney = Math.abs(strike - underlyingPrice) / underlyingPrice;
  const isITM = (option.type === 'call' && strike < underlyingPrice) || 
                (option.type === 'put' && strike > underlyingPrice);
  const isOTM = (option.type === 'call' && strike > underlyingPrice) || 
                (option.type === 'put' && strike < underlyingPrice);
  const isATM = Math.abs(strike - underlyingPrice) / underlyingPrice < 0.02;
  
  const spread = bid && ask ? ask - bid : 0;
  const spreadPercent = lastPrice > 0 ? (spread / lastPrice) * 100 : 0;
  
  return {
    percentFromMoney: percentFromMoney * 100,
    isITM,
    isOTM,
    isATM,
    spread,
    spreadPercent,
    intrinsicValue: isITM ? Math.abs(strike - underlyingPrice) : 0,
    timeValue: lastPrice - (isITM ? Math.abs(strike - underlyingPrice) : 0)
  };
};

// Generate mock data for testing
export const generateMockOption = (symbol, type = 'call', underlyingPrice = 100) => {
  const strike = Math.round(underlyingPrice * (0.95 + Math.random() * 0.1));
  const lastPrice = type === 'call' ? 
    Math.random() * 5 + 0.5 : 
    Math.random() * 4 + 0.3;
  
  return {
    symbol: `${symbol}240119${type === 'call' ? 'C' : 'P'}00${strike}000`,
    strike,
    type,
    lastPrice: parseFloat(lastPrice.toFixed(2)),
    bid: parseFloat((lastPrice * 0.98).toFixed(2)),
    ask: parseFloat((lastPrice * 1.02).toFixed(2)),
    volume: Math.floor(Math.random() * 5000) + 1000,
    openInterest: Math.floor(Math.random() * 10000) + 2000,
    impliedVolatility: 0.2 + Math.random() * 0.3,
    delta: type === 'call' ? 
      0.3 + Math.random() * 0.5 : 
      -(0.3 + Math.random() * 0.5),
    theta: -(0.04 + Math.random() * 0.03),
    gamma: 0.02 + Math.random() * 0.03,
    vega: 0.08 + Math.random() * 0.04,
    confidence: 50 + Math.floor(Math.random() * 40),
    reasons: ['Volume spike detected', 'Unusual open interest']
  };
};
