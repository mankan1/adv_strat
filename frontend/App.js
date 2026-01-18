// App.js - NO DEMO DATA, REAL BACKEND ONLY
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

// Import your SmartOpportunities component
import SmartOpportunities from './SmartOpportunities';

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSmartOpportunities, setShowSmartOpportunities] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [error, setError] = useState(null);
  const [apiEndpoints, setApiEndpoints] = useState([]);
  const backendUrl = 'https://advstrat-production.up.railway.app:5000';

  // Discover what endpoints are available
  const discoverEndpoints = async () => {
    const endpoints = [];
    const endpointsToTest = [
      '/market/overview',
      '/market/quote/SPY',
      '/scan/top-stocks',
      '/scan/stock/SPY',
      '/options/chain/SPY',
      '/options/expirations/SPY',
      '/health/detailed'
    ];

    for (const endpoint of endpointsToTest) {
      try {
        const response = await fetch(`${backendUrl}${endpoint}`, {
          method: endpoint === '/scan/top-stocks' ? 'POST' : 'GET',
          headers: endpoint === '/scan/top-stocks' ? { 'Content-Type': 'application/json' } : {},
          body: endpoint === '/scan/top-stocks' ? JSON.stringify({}) : null,
          timeout: 3000
        });
        
        if (response.ok) {
          endpoints.push(endpoint);
        }
      } catch (err) {
        // Endpoint not available
      }
    }
    
    setApiEndpoints(endpoints);
    return endpoints;
  };

  // Fetch REAL data from backend
  const fetchData = async () => {
    try {
      setError(null);
      setLoading(true);
      
      // 1. Check backend connection
      const healthResponse = await fetch(`${backendUrl}/health`);
      if (!healthResponse.ok) {
        throw new Error(`Backend not reachable (HTTP ${healthResponse.status})`);
      }
      
      setBackendConnected(true);
      
      // 2. Discover available endpoints
      const endpoints = await discoverEndpoints();
      console.log('Available endpoints:', endpoints);
      
      // 3. Try to fetch real data based on available endpoints
      let fetchedStocks = [];
      
      // Strategy 1: Try scan/top-stocks
      if (endpoints.includes('/scan/top-stocks')) {
        try {
          const response = await fetch(`${backendUrl}/scan/top-stocks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 5 })
          });
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.scans && data.scans.length > 0) {
              // Get quotes for each scanned stock
              for (const scan of data.scans.slice(0, 5)) {
                if (endpoints.includes('/market/quote/' + scan.symbol)) {
                  try {
                    const quoteResponse = await fetch(`${backendUrl}/market/quote/${scan.symbol}`);
                    const quoteData = await quoteResponse.json();
                    
                    if (quoteData.success) {
                      fetchedStocks.push({
                        symbol: scan.symbol,
                        price: quoteData.last,
                        change: quoteData.change,
                        change_percentage: quoteData.change_percentage,
                        confidence: scan.confidence || 50,
                        timestamp: quoteData.timestamp,
                        source: 'Real Scan Data'
                      });
                    }
                  } catch (quoteError) {
                    console.log(`Failed to fetch quote for ${scan.symbol}`);
                  }
                }
              }
            }
          }
        } catch (scanError) {
          console.log('Scan endpoint error:', scanError.message);
        }
      }
      
      // Strategy 2: If no scan data, try direct quotes
      if (fetchedStocks.length === 0 && endpoints.includes('/market/quote/SPY')) {
        // const popularSymbols = ['SPY', 'AAPL', 'MSFT', 'NVDA', 'TSLA'];
        const popularSymbols =  ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN'];
        // ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'GOOGL', 'AMZN',//];
        // "SOXS", "OCG", "YCBD", "NVDA", "CGC", "BBAI", "TQQQ", "SOXL", "WOK", "TZA", "PLUG", "SPY", "ASST", "TSLL", "RIVN", "AVGO", "TSLA", "TSLS", "MSOS", "ONDS", "INTC", "TLRY",

        // "ATPC", "SLV", "QQQ", "IQ", "TNYA", "JDST", "XLF", "BEAT", "FRMI", "TE", "KAVL", "IWM", "SQQQ", "ASBP", "ORCL", "SOFI", "VIVK", "BMNR", "PFE", "ZDGE", "DNN", "OPEN", "NFLX",

        // "HPE", "F", "AAL", "PLTD", "IBIT", "ETHA", "TLT", "KVUE", "WBD", "HYG", "QID", "WULF", "UGRO", "MARA", "PLTR", "RR", "BMNU", "BYND", "VALE", "SPDN", "BAC", "UVIX", "AAPL",

        // "LQD", "ACHR", "APLT", "SNAP", "CLSK", "NVD", "BITF", "IVP", "AMD", "FNGD", "NU", "GOGL", "AMZN", "IREN", "IRBT", "RZLT", "CRWV", "BTG", "BITO", "T", "NCI", "CVE", "RIG",

        // "RKLB", "QBTS", "XLE", "NIO", "RWM", "MISL", "HOOD", "CIFR", "PL"];
        
        for (const symbol of popularSymbols) {
          try {
            const response = await fetch(`${backendUrl}/market/quote/${symbol}`);
            const data = await response.json();
            
            if (data.success) {
              // Try to get confidence from scan endpoint
              let confidence = 50;
              if (endpoints.includes('/scan/stock/' + symbol)) {
                try {
                  const scanResponse = await fetch(`${backendUrl}/scan/stock/${symbol}`);
                  const scanData = await scanResponse.json();
                  if (scanData.success && scanData.confidence) {
                    confidence = scanData.confidence;
                  }
                } catch (scanError) {
                  // Use default confidence
                }
              }
              
              fetchedStocks.push({
                symbol: symbol,
                price: data.last,
                change: data.change,
                change_percentage: data.change_percentage,
                confidence: confidence,
                timestamp: data.timestamp,
                source: 'Direct Quote'
              });
            }
          } catch (symbolError) {
            console.log(`Failed to fetch ${symbol}:`, symbolError.message);
          }
        }
      }
      
      // Strategy 3: If we have market overview, use that
      if (fetchedStocks.length === 0 && endpoints.includes('/market/overview')) {
        try {
          const response = await fetch(`${backendUrl}/market/overview`);
          const data = await response.json();
          
          if (data.success && data.top_gainers && data.top_gainers.length > 0) {
            data.top_gainers.slice(0, 3).forEach(gainer => {
              fetchedStocks.push({
                symbol: gainer.symbol,
                price: gainer.last,
                change: gainer.change,
                change_percentage: gainer.change_percentage,
                confidence: 60,
                source: 'Market Overview'
              });
            });
          }
        } catch (overviewError) {
          console.log('Market overview error:', overviewError.message);
        }
      }
      
      // If we got REAL data, set it
      if (fetchedStocks.length > 0) {
        setStocks(fetchedStocks);
      } else {
        // No data available from any endpoint
        setStocks([]);
        setError('Backend connected but no market data endpoints are available');
      }
      
    } catch (err) {
      console.error('❌ Error:', err.message);
      setError(err.message);
      setBackendConnected(false);
      setStocks([]); // Empty array - NO DEMO DATA
      
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Test specific endpoint
  const testEndpoint = async (endpoint) => {
    try {
      const method = endpoint === '/scan/top-stocks' ? 'POST' : 'GET';
      const headers = endpoint === '/scan/top-stocks' ? { 'Content-Type': 'application/json' } : {};
      const body = endpoint === '/scan/top-stocks' ? JSON.stringify({}) : null;
      
      const response = await fetch(`${backendUrl}${endpoint}`, { method, headers, body });
      const data = await response.json();
      
      Alert.alert(
        `Endpoint: ${endpoint}`,
        `Status: ${response.status}\n\nResponse: ${JSON.stringify(data, null, 2).substring(0, 300)}...`
      );
    } catch (err) {
      Alert.alert('Error', `Failed to test ${endpoint}: ${err.message}`);
    }
  };

  // Manual refresh
  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Initial load
  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Connecting to real backend...</Text>
        <Text style={styles.loadingSubtext}>{backendUrl}</Text>
        <Text style={styles.loadingHint}>No demo data will be used</Text>
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

      {/* API Endpoints Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Available API Endpoints ({apiEndpoints.length})
        </Text>
        
        {apiEndpoints.length === 0 ? (
          <Text style={styles.noEndpointsText}>
            No API endpoints discovered. Check backend implementation.
          </Text>
        ) : (
          <View style={styles.endpointsGrid}>
            {apiEndpoints.map((endpoint, index) => (
              <TouchableOpacity
                key={index}
                style={styles.endpointButton}
                onPress={() => testEndpoint(endpoint)}
              >
                <Text style={styles.endpointText}>{endpoint}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        
        <TouchableOpacity 
          style={styles.discoverButton}
          onPress={discoverEndpoints}
        >
          <Text style={styles.discoverButtonText}>Rediscover Endpoints</Text>
        </TouchableOpacity>
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <Text style={styles.errorHint}>
            Ensure your backend has implemented:
            /market/quote/:symbol, /scan/top-stocks, or /market/overview
          </Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={styles.retryText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Recent Scans */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Recent Scans {stocks.length > 0 ? `(${stocks.length})` : ''}
          </Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={styles.refreshText}>🔄 Refresh</Text>
          </TouchableOpacity>
        </View>
        
        {stocks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📊</Text>
            <Text style={styles.emptyStateTitle}>No real data available</Text>
            <Text style={styles.emptyStateText}>
              Backend is connected but no market data endpoints are returning data.
              Check your backend implementation.
            </Text>
            <Text style={styles.emptyStateHint}>
              Available endpoints: {apiEndpoints.join(', ')}
            </Text>
          </View>
        ) : (
          stocks.map((stock, index) => (
            <View key={index} style={styles.stockCard}>
              <View style={styles.stockHeader}>
                <View>
                  <Text style={styles.stockSymbol}>{stock.symbol}</Text>
                  <Text style={styles.stockSource}>{stock.source}</Text>
                </View>
                <Text style={styles.stockPrice}>
                  ${typeof stock.price === 'number' ? stock.price.toFixed(2) : 'N/A'}
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
                
                <View style={styles.confidenceContainer}>
                  <Text style={styles.confidenceLabel}>Confidence:</Text>
                  <View style={styles.confidenceBar}>
                    <View 
                      style={[
                        styles.confidenceFill, 
                        { width: `${Math.min(100, stock.confidence)}%` }
                      ]} 
                    />
                  </View>
                  <Text style={styles.confidenceValue}>{stock.confidence}%</Text>
                </View>
              </View>
              
              {stock.timestamp && (
                <Text style={styles.timestamp}>
                  Updated: {new Date(stock.timestamp).toLocaleTimeString()}
                </Text>
              )}
            </View>
          ))
        )}
      </View>

      {/* Smart Opportunities Toggle */}
      <TouchableOpacity 
        style={[styles.toggleButton, !backendConnected && styles.disabledButton]}
        onPress={() => setShowSmartOpportunities(!showSmartOpportunities)}
        disabled={!backendConnected}
      >
        <Text style={styles.toggleButtonText}>
          {showSmartOpportunities ? '▼ Hide Smart Opportunities' : '🎯 Show Smart Opportunities'}
        </Text>
        {!backendConnected && (
          <Text style={styles.toggleButtonSubtext}>(Requires backend connection)</Text>
        )}
      </TouchableOpacity>

      {/* Smart Opportunities Component */}
      {showSmartOpportunities && backendConnected && (
        <SmartOpportunities backendUrl={backendUrl} />
      )}

      {/* Connection Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>System Status</Text>
        <View style={styles.statusGrid}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Backend</Text>
            <Text style={[
              styles.statusValue, 
              backendConnected ? styles.positive : styles.negative
            ]}>
              {backendConnected ? 'Online' : 'Offline'}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Endpoints</Text>
            <Text style={styles.statusValue}>{apiEndpoints.length}</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Stocks</Text>
            <Text style={styles.statusValue}>{stocks.length}</Text>
          </View>
        </View>
        
        <TouchableOpacity 
          style={styles.testButton}
          onPress={() => testEndpoint('/health')}
        >
          <Text style={styles.testButtonText}>Test /health Endpoint</Text>
        </TouchableOpacity>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>To Get Real Data:</Text>
        <Text style={styles.instructionsText}>1. Ensure backend is running on port 5000</Text>
        <Text style={styles.instructionsText}>2. Implement /market/quote/:symbol endpoint</Text>
        <Text style={styles.instructionsText}>3. Implement /scan/top-stocks endpoint</Text>
        <Text style={styles.instructionsText}>4. Add your Tradier API key to backend</Text>
      </View>
    </ScrollView>
  );
}

// Styles definition
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
    padding: 20,
  },
  loadingText: {
    fontSize: 18,
    marginTop: 20,
    color: '#667eea',
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    marginTop: 5,
    color: '#999',
    textAlign: 'center',
  },
  loadingHint: {
    fontSize: 12,
    marginTop: 10,
    color: '#f39c12',
    fontStyle: 'italic',
    textAlign: 'center',
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
  noEndpointsText: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: 20,
  },
  endpointsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 15,
  },
  endpointButton: {
    backgroundColor: '#f0f7ff',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1e7ff',
    minWidth: 150,
  },
  endpointText: {
    fontSize: 12,
    color: '#1976d2',
    textAlign: 'center',
  },
  discoverButton: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  discoverButtonText: {
    color: '#1976d2',
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
    fontSize: 16,
  },
  errorHint: {
    fontSize: 12,
    color: '#666',
    marginBottom: 15,
    fontStyle: 'italic',
  },
  retryText: {
    color: '#667eea',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 14,
  },
  refreshText: {
    color: '#667eea',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 15,
    opacity: 0.3,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 20,
  },
  emptyStateHint: {
    fontSize: 12,
    color: '#95a5a6',
    textAlign: 'center',
    fontStyle: 'italic',
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
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  stockSymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  stockSource: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  stockPrice: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2ecc71',
  },
  stockDetails: {
    marginBottom: 10,
  },
  stockChange: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  positive: {
    color: '#2ecc71',
  },
  negative: {
    color: '#e74c3c',
  },
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confidenceLabel: {
    fontSize: 14,
    color: '#666',
  },
  confidenceBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  confidenceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    minWidth: 40,
  },
  timestamp: {
    fontSize: 11,
    color: '#95a5a6',
    textAlign: 'right',
  },
  toggleButton: {
    marginHorizontal: 15,
    marginVertical: 10,
    backgroundColor: '#667eea',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#95a5a6',
    opacity: 0.6,
  },
  toggleButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  toggleButtonSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 5,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  statusItem: {
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  testButton: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButtonText: {
    color: '#1976d2',
    fontWeight: '600',
  },
  instructions: {
    margin: 15,
    padding: 15,
    backgroundColor: '#fff3cd',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#856404',
    marginBottom: 10,
  },
  instructionsText: {
    fontSize: 14,
    color: '#856404',
    marginBottom: 5,
  },
});
