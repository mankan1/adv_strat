// API Configuration
export const API_BASE_URL = process.env.API_BASE_URL || 'http://advstrat-production.up.railway.app'; //https://advstrat-production.up.railway.app
export const SOCKET_URL = process.env.SOCKET_URL || 'ws://advstrat-production.up.railway.app';

// Application Constants
export const APP_NAME = 'Options Scanner';
export const APP_VERSION = '1.0.0';

// Scanner Settings
export const SCANNER_CONFIG = {
  DEFAULT_LIMIT: 8,
  MIN_VOLUME: 1000,
  MIN_CONFIDENCE: 50,
  SCAN_INTERVAL: 30000, // 30 seconds
  MAX_RETRIES: 3
};

// Market Symbols
export const MARKET_SYMBOLS = {
  INDICES: ['SPX', 'NDX', 'DJI', 'RUT', 'VIX'],
  ETFS: ['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD'],
  TOP_STOCKS: 
  ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN']
  //['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'JPM']
  // ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN', //],
  // "SOXS", "OCG", "YCBD", "NVDA", "CGC", "BBAI", "TQQQ", "SOXL", "WOK", "TZA", "PLUG", "SPY", "ASST", "TSLL", "RIVN", "AVGO", "TSLA", "TSLS", "MSOS", "ONDS", "INTC", "TLRY",

  // "ATPC", "SLV", "QQQ", "IQ", "TNYA", "JDST", "XLF", "BEAT", "FRMI", "TE", "KAVL", "IWM", "SQQQ", "ASBP", "ORCL", "SOFI", "VIVK", "BMNR", "PFE", "ZDGE", "DNN", "OPEN", "NFLX",

  // "HPE", "F", "AAL", "PLTD", "IBIT", "ETHA", "TLT", "KVUE", "WBD", "HYG", "QID", "WULF", "UGRO", "MARA", "PLTR", "RR", "BMNU", "BYND", "VALE", "SPDN", "BAC", "UVIX", "AAPL",

  // "LQD", "ACHR", "APLT", "SNAP", "CLSK", "NVD", "BITF", "IVP", "AMD", "FNGD", "NU", "GOGL", "AMZN", "IREN", "IRBT", "RZLT", "CRWV", "BTG", "BITO", "T", "NCI", "CVE", "RIG",

  // "RKLB", "QBTS", "XLE", "NIO", "RWM", "MISL", "HOOD", "CIFR", "PL"]
  };

// Colors
export const COLORS = {
  PRIMARY: '#1a1a2e',
  SECONDARY: '#16213e',
  ACCENT: '#0f3460',
  SUCCESS: '#4CAF50',
  WARNING: '#FF9800',
  ERROR: '#F44336',
  INFO: '#2196F3',
  BULLISH: '#4CAF50',
  BEARISH: '#F44336',
  NEUTRAL: '#FF9800',
  TEXT_PRIMARY: '#ffffff',
  TEXT_SECONDARY: '#B0B0B0',
  BACKGROUND: '#0a0a1a',
  CARD_BACKGROUND: '#1e1e3a',
  BORDER: '#2d2d4d'
};

// Chart Colors
export const CHART_COLORS = {
  LINE: '#4A90E2',
  AREA: 'rgba(74, 144, 226, 0.2)',
  GRID: 'rgba(255, 255, 255, 0.1)',
  TEXT: 'rgba(255, 255, 255, 0.7)',
  BACKGROUND: 'transparent'
};

// Strategy Types
export const STRATEGY_TYPES = {
  VERTICAL_SPREAD: 'Vertical Spread',
  IRON_CONDOR: 'Iron Condor',
  STRADDLE: 'Straddle',
  STRANGLE: 'Strangle',
  CALENDAR_SPREAD: 'Calendar Spread',
  DIAGONAL_SPREAD: 'Diagonal Spread',
  BUTTERFLY: 'Butterfly',
  COVERED_CALL: 'Covered Call',
  PROTECTIVE_PUT: 'Protective Put'
};

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  SERVER_ERROR: 'Server error. Please try again later.',
  API_ERROR: 'API error. Please check backend configuration.',
  NO_DATA: 'No data available.',
  LOADING: 'Loading data...'
};

// Date Formats
export const DATE_FORMATS = {
  SHORT: 'MM/DD/YY',
  MEDIUM: 'MMM DD, YYYY',
  LONG: 'MMMM DD, YYYY',
  TIME: 'h:mm A',
  DATETIME: 'MM/DD/YY h:mm A'
};

// Local Storage Keys
export const STORAGE_KEYS = {
  FAVORITES: 'favorite_stocks',
  SETTINGS: 'app_settings',
  RECENT_SCANS: 'recent_scans',
  WATCHLIST: 'watchlist'
};
