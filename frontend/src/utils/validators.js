// Stock symbol validation
export const isValidSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') return false;
  
  // Basic validation: 1-6 uppercase letters
  const symbolRegex = /^[A-Z]{1,6}$/;
  return symbolRegex.test(symbol.trim().toUpperCase());
};

// Number validation
export const isValidNumber = (value, min = null, max = null) => {
  if (value === null || value === undefined) return false;
  
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  
  if (min !== null && num < min) return false;
  if (max !== null && num > max) return false;
  
  return true;
};

// Date validation
export const isValidDate = (date) => {
  if (!date) return false;
  
  const d = new Date(date);
  return d instanceof Date && !isNaN(d);
};

// Option strike validation
export const isValidStrike = (strike, underlyingPrice = null) => {
  if (!isValidNumber(strike, 0.01)) return false;
  
  if (underlyingPrice !== null) {
    // Strike should be within reasonable range of underlying price
    const percentDiff = Math.abs(strike - underlyingPrice) / underlyingPrice;
    return percentDiff <= 2; // Within 200% of underlying price
  }
  
  return true;
};

// Percentage validation
export const isValidPercentage = (value) => {
  return isValidNumber(value, 0, 100);
};

// Confidence score validation
export const isValidConfidence = (value) => {
  return isValidNumber(value, 0, 100);
};

// Volume validation
export const isValidVolume = (value) => {
  return isValidNumber(value, 0);
};

// Expiration date validation (must be in future)
export const isValidExpiration = (date) => {
  if (!isValidDate(date)) return false;
  
  const expirationDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return expirationDate >= today;
};

// API response validation
export const isValidApiResponse = (response) => {
  return response && 
         typeof response === 'object' && 
         response.success !== undefined;
};

// Options chain validation
export const isValidOptionsChain = (chain) => {
  if (!Array.isArray(chain)) return false;
  
  // Check first few items have required fields
  if (chain.length > 0) {
    const firstOption = chain[0];
    return firstOption.symbol && 
           firstOption.strike && 
           firstOption.option_type;
  }
  
  return true;
};

// Market data validation
export const isValidMarketData = (data) => {
  return data && 
         typeof data === 'object' && 
         data.symbol && 
         data.price !== undefined;
};

// Scan results validation
export const isValidScanResults = (results) => {
  if (!Array.isArray(results)) return false;
  
  if (results.length > 0) {
    const firstResult = results[0];
    return firstResult.symbol && 
           firstResult.underlyingPrice !== undefined;
  }
  
  return true;
};

// Strategy validation
export const isValidStrategy = (strategy) => {
  return strategy && 
         strategy.type && 
         strategy.name && 
         isValidNumber(strategy.probability, 0, 100);
};

// Form validation for scanner filters
export const validateScannerFilters = (filters) => {
  const errors = {};
  
  if (filters.limit && !isValidNumber(filters.limit, 1, 50)) {
    errors.limit = 'Limit must be between 1 and 50';
  }
  
  if (filters.minVolume && !isValidNumber(filters.minVolume, 0)) {
    errors.minVolume = 'Minimum volume must be a positive number';
  }
  
  if (filters.minConfidence && !isValidConfidence(filters.minConfidence)) {
    errors.minConfidence = 'Confidence must be between 0 and 100';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// WebSocket message validation
export const isValidWebSocketMessage = (message) => {
  return message && 
         typeof message === 'object' && 
         message.type && 
         message.data !== undefined;
};

// Cache key validation
export const isValidCacheKey = (key) => {
  return key && 
         typeof key === 'string' && 
         key.length > 0 && 
         key.length <= 255;
};

// URL validation for API endpoints
export const isValidApiUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// Input sanitization
export const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove < and >
      .trim()
      .substring(0, 1000); // Limit length
  }
  
  return input;
};

// Symbol normalization
export const normalizeSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') return '';
  
  return symbol
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, ''); // Keep only alphanumeric, dots, and hyphens
};

// Price normalization
export const normalizePrice = (price) => {
  if (price === null || price === undefined) return 0;
  
  const num = parseFloat(price);
  if (isNaN(num)) return 0;
  
  // Round to reasonable decimal places based on price
  if (num < 0.01) return parseFloat(num.toFixed(6));
  if (num < 1) return parseFloat(num.toFixed(4));
  if (num < 10) return parseFloat(num.toFixed(3));
  if (num < 1000) return parseFloat(num.toFixed(2));
  return parseFloat(num.toFixed(0));
};

// Percentage normalization
export const normalizePercentage = (percent) => {
  if (percent === null || percent === undefined) return 0;
  
  const num = parseFloat(percent);
  if (isNaN(num)) return 0;
  
  // Ensure it's between -1000% and 1000%
  const normalized = Math.max(-1000, Math.min(1000, num));
  return parseFloat(normalized.toFixed(2));
};

// Volume normalization
export const normalizeVolume = (volume) => {
  if (volume === null || volume === undefined) return 0;
  
  const num = parseInt(volume);
  if (isNaN(num)) return 0;
  
  // Ensure non-negative
  return Math.max(0, num);
};
