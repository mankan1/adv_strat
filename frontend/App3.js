import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl
} from 'react-native';

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [error, setError] = useState(null);
  const backendUrl = 'https://advstrat-production.up.railway.app:5000';

  // Fetch all data from backend
  const fetchData = async () => {
    try {
      setError(null);
      console.log('🔄 Fetching data from backend...');
      
      // 1. Check backend connection using /health
      console.log('🔍 Checking backend connection...');
      const healthResponse = await fetch(`${backendUrl}/health`);
      
      if (!healthResponse.ok) {
        throw new Error(`Backend health check failed: ${healthResponse.status}`);
      }
      
      const healthData = await healthResponse.json();
      setBackendConnected(true);
      console.log('✅ Backend connected:', healthData.service);
      
      // 2. Try to fetch market overview or other data
      // Since we don't know your exact endpoints, let's try a few
      
      // Option A: Try /market/overview
      try {
        const overviewResponse = await fetch(`${backendUrl}/market/overview`);
        if (overviewResponse.ok) {
          const overviewData = await overviewResponse.json();
          console.log('📊 Got market overview');
          // Process overview data if needed
        }
      } catch (overviewError) {
        console.log('Market overview not available');
      }
      
      // Option B: Try to fetch some stock data
      // Let's try SPY as a test
      try {
        const spyResponse = await fetch(`${backendUrl}/market/quote/SPY`);
        if (spyResponse.ok) {
          const spyData = await spyResponse.json();
          
          if (spyData.success) {
            setStocks([
              {
                symbol: 'SPY',
                price: spyData.last,
                change: spyData.change,
                change_percentage: spyData.change_percentage,
                confidence: 75,
                timestamp: spyData.timestamp,
                source: 'Real API Data'
              }
            ]);
            console.log('✅ Loaded real data for SPY');
          }
        }
      } catch (quoteError) {
        console.log('Quote endpoint not available');
      }
      
      // If no data was loaded, show a message
      if (stocks.length === 0) {
        setStocks([
          {
            symbol: 'BACKEND',
            price: 0,
            change: 0,
            change_percentage: 0,
            confidence: 0,
            note: 'Backend connected but no market data endpoints found'
          }
        ]);
      }
      
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

  // Initial load
  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Connecting to backend...</Text>
        <Text style={styles.loadingSubtext}>{backendUrl}</Text>
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

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
          <TouchableOpacity onPress={fetchData}>
            <Text style={styles.retryText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Debug Info */}
      <View style={styles.debugSection}>
        <Text style={styles.debugTitle}>Backend Info</Text>
        <Text style={styles.debugText}>URL: {backendUrl}</Text>
        <Text style={styles.debugText}>Status: {backendConnected ? 'Connected' : 'Disconnected'}</Text>
        <TouchableOpacity 
          style={styles.testButton}
          onPress={async () => {
            try {
              const response = await fetch(`${backendUrl}/health`);
              const data = await response.json();
              alert(`Backend Health:\n\nService: ${data.service}\nVersion: ${data.version}\nUptime: ${Math.round(data.uptime)}s`);
            } catch (err) {
              alert(`Error: ${err.message}`);
            }
          }}
        >
          <Text style={styles.testButtonText}>Test /health Endpoint</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Scans */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Scans</Text>
        
        {stocks.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No stock data available</Text>
            <TouchableOpacity onPress={fetchData}>
              <Text style={styles.retryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          stocks.map((stock, index) => (
            <View key={index} style={styles.stockCard}>
              <View style={styles.stockHeader}>
                <Text style={styles.stockSymbol}>{stock.symbol}</Text>
                <Text style={styles.stockPrice}>
                  ${stock.price > 0 ? stock.price.toFixed(2) : 'N/A'}
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

      {/* Advanced Trading Toggle */}
      <TouchableOpacity 
        style={styles.toggleButton}
        onPress={() => setShowAdvanced(!showAdvanced)}
        disabled={!backendConnected}
      >
        <Text style={styles.toggleButtonText}>
          {showAdvanced ? '▼ Hide Advanced Trading' : '▶ Show Advanced Trading'}
        </Text>
      </TouchableOpacity>

      {/* Instructions */}
      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>Next Steps:</Text>
        <Text style={styles.instructionsText}>1. Backend is running ✅</Text>
        <Text style={styles.instructionsText}>2. Need to implement API endpoints</Text>
        <Text style={styles.instructionsText}>3. Check your backend routes file</Text>
      </View>
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
    padding: 20,
  },
  loadingText: {
    fontSize: 18,
    marginTop: 20,
    color: '#667eea',
  },
  loadingSubtext: {
    fontSize: 14,
    marginTop: 5,
    color: '#999',
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
  debugSection: {
    margin: 15,
    padding: 15,
    backgroundColor: '#e3f2fd',
    borderRadius: 10,
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976d2',
    marginBottom: 10,
  },
  debugText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  testButton: {
    backgroundColor: '#1976d2',
    padding: 10,
    borderRadius: 6,
    marginTop: 10,
    alignItems: 'center',
  },
  testButtonText: {
    color: 'white',
    fontWeight: '600',
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  emptyState: {
    padding: 30,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 15,
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
  toggleButton: {
    marginHorizontal: 15,
    marginVertical: 10,
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
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
