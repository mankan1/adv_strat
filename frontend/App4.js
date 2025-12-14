import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [availableEndpoints, setAvailableEndpoints] = useState([]);
  const [error, setError] = useState(null);
  const backendUrl = 'http://localhost:5000';

  // Test if an endpoint exists
  const testEndpoint = async (endpoint, method = 'GET', body = null) => {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        timeout: 3000
      };
      
      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
      }
      
      const response = await fetch(`${backendUrl}${endpoint}`, options);
      return {
        exists: response.ok,
        status: response.status,
        url: endpoint
      };
    } catch (err) {
      return {
        exists: false,
        error: err.message,
        url: endpoint
      };
    }
  };

  // Discover available endpoints
  const discoverEndpoints = async () => {
    const endpointsToTest = [
      // Market endpoints
      { url: '/market/overview', method: 'GET' },
      { url: '/market/quote/AAPL', method: 'GET' },
      { url: '/market/quote/SPY', method: 'GET' },
      
      // Scan endpoints
      { url: '/scan/top-stocks', method: 'POST', body: {} },
      { url: '/scan/stock/AAPL', method: 'GET' },
      { url: '/scan/history', method: 'GET' },
      
      // Options endpoints
      { url: '/options/chain/SPY', method: 'GET' },
      { url: '/options/expirations/AAPL', method: 'GET' },
      
      // Status endpoints
      { url: '/health/detailed', method: 'GET' },
      { url: '/websocket/info', method: 'GET' },
    ];

    const results = [];
    for (const endpoint of endpointsToTest) {
      const result = await testEndpoint(endpoint.url, endpoint.method, endpoint.body);
      results.push({ ...endpoint, ...result });
    }

    const available = results.filter(r => r.exists);
    setAvailableEndpoints(available);
    console.log('Available endpoints:', available.map(e => e.url));
    
    return available;
  };

  // Fetch data using available endpoints
  const fetchData = async () => {
    try {
      setError(null);
      console.log('🔄 Starting data fetch...');
      
      // 1. Check backend connection
      const healthCheck = await testEndpoint('/health');
      if (!healthCheck.exists) {
        throw new Error('Backend not reachable');
      }
      
      setBackendConnected(true);
      
      // 2. Discover available endpoints
      const endpoints = await discoverEndpoints();
      
      // 3. Try to fetch stock data using available endpoints
      const stockData = [];
      
      // Strategy 1: Try /scan/top-stocks
      const scanEndpoint = endpoints.find(e => e.url === '/scan/top-stocks');
      if (scanEndpoint) {
        try {
          console.log('📊 Trying scan/top-stocks endpoint...');
          const response = await fetch(`${backendUrl}/scan/top-stocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 5 })
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.scans && data.scans.length > 0) {
              for (const scan of data.scans.slice(0, 5)) {
                // Get quote for each stock
                const quoteResult = await testEndpoint(`/market/quote/${scan.symbol}`);
                if (quoteResult.exists) {
                  const quoteResponse = await fetch(`${backendUrl}/market/quote/${scan.symbol}`);
                  const quoteData = await quoteResponse.json();
                  
                  if (quoteData.success) {
                    stockData.push({
                      symbol: scan.symbol,
                      price: quoteData.last,
                      change: quoteData.change,
                      change_percentage: quoteData.change_percentage,
                      confidence: scan.confidence || 50,
                      timestamp: quoteData.timestamp,
                      source: 'Real API'
                    });
                  }
                }
              }
            }
          }
        } catch (scanError) {
          console.log('Scan endpoint failed:', scanError.message);
        }
      }
      
      // Strategy 2: If no scan data, try popular stocks directly
      if (stockData.length === 0) {
        console.log('📈 Trying popular stocks directly...');
        const popularSymbols = ['SPY', 'AAPL', 'MSFT', 'GOOGL', 'TSLA'];
        
        for (const symbol of popularSymbols) {
          const quoteResult = await testEndpoint(`/market/quote/${symbol}`);
          if (quoteResult.exists) {
            try {
              const response = await fetch(`${backendUrl}/market/quote/${symbol}`);
              const data = await response.json();
              
              if (data.success) {
                stockData.push({
                  symbol: symbol,
                  price: data.last,
                  change: data.change,
                  change_percentage: data.change_percentage,
                  confidence: 50, // Default
                  timestamp: data.timestamp,
                  source: 'Direct Quote'
                });
              }
            } catch (err) {
              console.log(`Failed to fetch ${symbol}:`, err.message);
            }
          }
        }
      }
      
      // Strategy 3: If still no data, use mock with endpoint info
      if (stockData.length === 0) {
        console.log('⚠️ No stock data available, showing endpoint info');
        stockData.push({
          symbol: 'BACKEND',
          price: 0,
          change: 0,
          change_percentage: 0,
          confidence: 0,
          note: `Available endpoints: ${endpoints.length}`,
          source: 'Debug'
        });
      }
      
      setStocks(stockData);
      
    } catch (err) {
      console.error('❌ Error:', err.message);
      setError(err.message);
      setBackendConnected(false);
      setStocks([]);
      
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Manual refresh
  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Test a specific endpoint
  const testAndShowEndpoint = async (url) => {
    try {
      const response = await fetch(`${backendUrl}${url}`);
      const data = await response.json();
      Alert.alert(
        `Endpoint: ${url}`,
        JSON.stringify(data, null, 2).substring(0, 500) + '...',
        [{ text: 'OK' }]
      );
    } catch (err) {
      Alert.alert('Error', `Failed to test ${url}: ${err.message}`);
    }
  };

  // Initial load
  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Discovering backend endpoints...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Options Scanner</Text>
        <Text style={styles.subtitle}>Real-time options analysis</Text>
        
        <View style={[
          styles.connectionBadge, 
          backendConnected ? styles.connected : styles.disconnected
        ]}>
          <Text style={styles.connectionText}>
            {backendConnected ? '✅ Backend Connected' : '❌ Backend Disconnected'}
          </Text>
          <Text style={styles.connectionUrl}>{backendUrl}</Text>
        </View>
      </View>

      {/* Available Endpoints */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available Endpoints ({availableEndpoints.length})</Text>
        
        {availableEndpoints.length === 0 ? (
          <Text style={styles.noEndpointsText}>No API endpoints discovered</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.endpointsContainer}>
              {availableEndpoints.map((endpoint, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.endpointButton}
                  onPress={() => testAndShowEndpoint(endpoint.url)}
                >
                  <Text style={styles.endpointMethod}>{endpoint.method}</Text>
                  <Text style={styles.endpointUrl}>{endpoint.url}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
        
        <TouchableOpacity 
          style={styles.discoverButton}
          onPress={discoverEndpoints}
        >
          <Text style={styles.discoverButtonText}>Rediscover Endpoints</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Scans */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Scans</Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={styles.refreshText}>🔄 Refresh</Text>
          </TouchableOpacity>
        </View>
        
        {stocks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No stock data available</Text>
          </View>
        ) : (
          stocks.map((stock, index) => (
            <View key={index} style={styles.stockCard}>
              <View style={styles.stockHeader}>
                <Text style={styles.stockSymbol}>{stock.symbol}</Text>
                <Text style={styles.stockPrice}>
                  {stock.price > 0 ? `$${stock.price.toFixed(2)}` : 'N/A'}
                </Text>
              </View>
              
              <View style={styles.stockDetails}>
                <Text style={[
                  styles.stockChange, 
                  stock.change >= 0 ? styles.positive : styles.negative
                ]}>
                  {stock.change >= 0 ? '+' : ''}{stock.change?.toFixed(2) || '0.00'} 
                  ({stock.change_percentage?.toFixed(2) || '0.00'}%)
                </Text>
                
                <Text style={styles.confidenceValue}>
                  Confidence: {stock.confidence}%
                </Text>
              </View>
              
              {stock.note && (
                <Text style={styles.noteText}>{stock.note}</Text>
              )}
              
              {stock.source && (
                <Text style={styles.sourceText}>Source: {stock.source}</Text>
              )}
            </View>
          ))
        )}
      </View>

      {/* Debug Actions */}
      <View style={styles.debugSection}>
        <Text style={styles.debugTitle}>Debug Actions</Text>
        
        <View style={styles.debugButtons}>
          <TouchableOpacity 
            style={styles.debugButton}
            onPress={() => testAndShowEndpoint('/health')}
          >
            <Text style={styles.debugButtonText}>Test /health</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.debugButton}
            onPress={() => testAndShowEndpoint('/market/quote/SPY')}
          >
            <Text style={styles.debugButtonText}>Test SPY Quote</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.debugButton}
            onPress={() => testAndShowEndpoint('/market/overview')}
          >
            <Text style={styles.debugButtonText}>Test Overview</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 18,
    marginTop: 20,
    color: '#667eea',
  },
  header: {
    backgroundColor: '#667eea',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 15,
  },
  connectionBadge: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  connected: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  disconnected: {
    backgroundColor: 'rgba(244, 67, 54, 0.2)',
  },
  connectionText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  connectionUrl: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 5,
  },
  section: {
    margin: 15,
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  refreshText: {
    color: '#667eea',
    fontSize: 14,
    fontWeight: '600',
  },
  noEndpointsText: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  endpointsContainer: {
    flexDirection: 'row',
    paddingBottom: 10,
  },
  endpointButton: {
    backgroundColor: '#f0f7ff',
    padding: 10,
    borderRadius: 6,
    marginRight: 10,
    minWidth: 120,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1e7ff',
  },
  endpointMethod: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 5,
  },
  endpointUrl: {
    fontSize: 11,
    color: '#333',
    textAlign: 'center',
  },
  discoverButton: {
    backgroundColor: '#e3f2fd',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 10,
  },
  discoverButtonText: {
    color: '#1976d2',
    fontWeight: '600',
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
  },
  stockCard: {
    marginBottom: 15,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  stockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stockSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  stockPrice: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2ecc71',
  },
  stockDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stockChange: {
    fontSize: 16,
    fontWeight: '600',
  },
  positive: {
    color: '#2ecc71',
  },
  negative: {
    color: '#e74c3c',
  },
  confidenceValue: {
    fontSize: 14,
    color: '#666',
  },
  noteText: {
    fontSize: 12,
    color: '#f39c12',
    marginTop: 10,
    fontStyle: 'italic',
  },
  sourceText: {
    fontSize: 11,
    color: '#95a5a6',
    marginTop: 5,
  },
  debugSection: {
    margin: 15,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 10,
  },
  debugButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  debugButton: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
  },
  debugButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  errorContainer: {
    margin: 15,
    padding: 15,
    backgroundColor: '#ffebee',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
  },
  errorText: {
    color: '#c62828',
    marginBottom: 10,
  },
  retryText: {
    color: '#667eea',
    fontWeight: '600',
    textAlign: 'center',
  },
});
