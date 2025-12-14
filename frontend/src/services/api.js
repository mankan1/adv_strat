import axios from 'axios';
import { API_BASE_URL, SCANNER_CONFIG, ERROR_MESSAGES } from '../config/constants';
import Toast from 'react-native-toast-message';

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add timestamp to avoid caching
    if (config.method === 'get') {
      config.params = {
        ...config.params,
        _t: Date.now()
      };
    }
    
    console.log(`🚀 ${config.method.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`✅ ${response.status} ${response.config.url}`);
    return response.data;
  },
  (error) => {
    const { response, message } = error;
    
    let errorMessage = ERROR_MESSAGES.NETWORK_ERROR;
    
    if (response) {
      // Server responded with error
      console.error(`❌ ${response.status} ${error.config.url}:`, response.data);
      
      switch (response.status) {
        case 401:
          errorMessage = 'Authentication failed. Please check your API key.';
          break;
        case 404:
          errorMessage = 'Endpoint not found.';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded. Please wait a minute.';
          break;
        case 500:
          errorMessage = response.data?.error || ERROR_MESSAGES.SERVER_ERROR;
          break;
        default:
          errorMessage = response.data?.error || `Error ${response.status}`;
      }
    } else if (message.includes('timeout')) {
      errorMessage = 'Request timeout. Server is not responding.';
    } else if (message.includes('Network Error')) {
      errorMessage = 'Cannot connect to server. Please check if backend is running.';
    }
    
    // Show error toast
    Toast.show({
      type: 'error',
      text1: 'API Error',
      text2: errorMessage,
      position: 'bottom',
      visibilityTime: 4000
    });
    
    return Promise.reject({
      message: errorMessage,
      originalError: error,
      status: response?.status
    });
  }
);

// Health check
export const checkHealth = async () => {
  try {
    const data = await api.get('/health');
    return {
      success: true,
      ...data,
      backendUrl: API_BASE_URL
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      backendUrl: API_BASE_URL
    };
  }
};

// Market Data
export const getMarketOverview = async () => {
  try {
    return await api.get('/api/market/overview');
  } catch (error) {
    console.error('Market overview error:', error);
    throw error;
  }
};

export const getQuote = async (symbol) => {
  try {
    const data = await api.get(`/api/market/quote/${symbol}`);
    return data;
  } catch (error) {
    console.error(`Quote error for ${symbol}:`, error);
    throw error;
  }
};

// Options Scanner
export const scanTopStocks = async (filters = {}) => {
  try {
    const params = {
      limit: filters.limit || SCANNER_CONFIG.DEFAULT_LIMIT,
      minVolume: filters.minVolume || SCANNER_CONFIG.MIN_VOLUME,
      minConfidence: filters.minConfidence || SCANNER_CONFIG.MIN_CONFIDENCE,
      ...filters
    };
    
    console.log('📡 Scanning top stocks with params:', params);
    
    const data = await api.post('/api/scan/top-stocks', params);
    
    if (data.success) {
      Toast.show({
        type: 'success',
        text1: 'Scan Complete',
        text2: `Found ${data.count} stocks with unusual activity`,
        position: 'bottom',
        visibilityTime: 3000
      });
    }
    
    return data;
  } catch (error) {
    console.error('Scan error:', error);
    throw error;
  }
};

export const scanSingleStock = async (symbol, expiration = null) => {
  try {
    const params = expiration ? { expiration } : {};
    const data = await api.get(`/api/scan/stock/${symbol}`, { params });
    
    if (data.success) {
      Toast.show({
        type: 'success',
        text1: 'Scan Complete',
        text2: `Analyzed ${symbol}`,
        position: 'bottom',
        visibilityTime: 3000
      });
    }
    
    return data;
  } catch (error) {
    console.error(`Single scan error for ${symbol}:`, error);
    throw error;
  }
};

// Options Data
export const getOptionsChain = async (symbol, expiration = null) => {
  try {
    const params = expiration ? { expiration } : {};
    const data = await api.get(`/api/options/chain/${symbol}`, { params });
    return data;
  } catch (error) {
    console.error(`Options chain error for ${symbol}:`, error);
    throw error;
  }
};

export const getOptionExpirations = async (symbol) => {
  try {
    const data = await api.get(`/api/options/expirations/${symbol}`);
    return data;
  } catch (error) {
    console.error(`Expirations error for ${symbol}:`, error);
    throw error;
  }
};

// Scan History
export const getScanHistory = async (symbol = null, limit = 10) => {
  try {
    const params = { limit };
    if (symbol) params.symbol = symbol;
    
    const data = await api.get('/api/scan/history', { params });
    return data;
  } catch (error) {
    console.error('Scan history error:', error);
    throw error;
  }
};

// API Status
export const getApiStatus = async () => {
  try {
    const data = await api.get('/api/status');
    return data;
  } catch (error) {
    console.error('API status error:', error);
    throw error;
  }
};

// Real-time Data (WebSocket)
export const subscribeToStock = async (socket, symbol) => {
  if (socket && socket.connected) {
    socket.emit('subscribe', { symbol, type: 'scans' });
    return true;
  }
  return false;
};

export const unsubscribeFromStock = async (socket, symbol) => {
  if (socket && socket.connected) {
    socket.emit('unsubscribe', { symbol, type: 'scans' });
    return true;
  }
  return false;
};

// Batch Operations
export const batchGetQuotes = async (symbols) => {
  try {
    // Note: This would need backend support for batch quotes
    // For now, we'll fetch sequentially
    const quotes = {};
    
    for (const symbol of symbols.slice(0, 10)) { // Limit to 10
      try {
        const quote = await getQuote(symbol);
        quotes[symbol] = quote;
        await new Promise(resolve => setTimeout(resolve, 100)); // Rate limiting
      } catch (error) {
        console.error(`Failed to fetch ${symbol}:`, error);
      }
    }
    
    return quotes;
  } catch (error) {
    console.error('Batch quotes error:', error);
    throw error;
  }
};

// Cache Management
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const getCachedData = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
};

export const setCachedData = (key, data) => {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
  
  // Clean up old cache entries
  if (cache.size > 100) {
    const keys = Array.from(cache.keys()).slice(0, 50);
    keys.forEach(k => cache.delete(k));
  }
};

export const clearCache = () => {
  cache.clear();
};

export default api;
