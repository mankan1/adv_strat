import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert
} from 'react-native';
import AdvancedTrading from './AdvancedTrading';

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [apiStatus, setApiStatus] = useState(null);
  const [error, setError] = useState(null);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Backend base URL
  const BACKEND_URL = 'http://localhost:5000';

  // Fetch all data from backend
  const fetchData = async () => {
    try {
      setError(null);
      console.log('🔄 Fetching data from backend...');
      
      // 1. Check backend connection
      console.log('🔍 Checking backend connection...');
      const statusResponse = await fetch(`${BACKEND_URL}/status`);
      const statusData = await statusResponse.json();
      
      if (!statusData.success) {
        throw new Error('Backend status check failed');
      }
      
      setBackendConnected(true);
      setApiStatus(statusData);
      console.log('✅ Backend connected:', statusData.environment);
      
      // 2. Fetch recent scans (top stocks)
      console.log('🔍 Fetching recent scans...');
      const scanResponse = await fetch(`${BACKEND_URL}/scan/top-stocks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ limit: 5 })
      });
      
      let scanData;
      try {
        scanData = await scanResponse.json();
      } catch (parseError) {
        console.error('Failed to parse scan response:', parseError);
        throw new Error('Invalid response from scan endpoint');
      }
      
      if (scanData.success && scanData.scans && scanData.scans.length > 0) {
        // Process each stock with real data
        const processedStocks = await Promise.all(
          scanData.scans.map(async (scan) => {
            try {
              // Get real-time quote
              const quoteResponse = await fetch(`${BACKEND_URL}/market/quote/${scan.symbol}`);
              const quoteData = await quoteResponse.json();
              
              if (quoteData.success) {
                return {
                  symbol: scan.symbol,
                  price: quoteData.last,
                  change: quoteData.change,
                  change_percentage: quoteData.change_percentage,
                  confidence: scan.confidence || 0,
                  volume: quoteData.volume,
                  timestamp: quoteData.timestamp,
                  // Optional: Include scan details
                  scan_data: {
                    unusual_volume: scan.unusual_volume,
                    volume_ratio: scan.volume_ratio,
                    implied_volatility: scan.implied_volatility
                  }
                };
              }
              
              // Use scan data as fallback
              return {
                symbol: scan.symbol,
                price: scan.price || 0,
                change: scan.change || 0,
                change_percentage: scan.change_percentage || 0,
                confidence: scan.confidence || 0,
                timestamp: scan.timestamp
              };
              
            } catch (quoteError) {
              console.error(`Error fetching quote for ${scan.symbol}:`, quoteError);
              return null;
            }
          })
        );
        
        // Filter out null values and set state
        const validStocks = processedStocks.filter(stock => stock !== null && stock.price > 0);
        setStocks(validStocks);
        
        if (validStocks.length === 0) {
          // Fallback to popular stocks
          await fetchPopularStocks();
        }
        
      } else {
        console.log('⚠️ No scan data available, fetching popular stocks...');
        await fetchPopularStocks();
      }
      
    } catch (err) {
      console.error('❌ Error fetching data:', err.message || err);
      setError(err.message || 'Failed to connect to backend');
      setBackendConnected(false);
      
      // Try fallback
      await fetchPopularStocks();
      
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fallback: Fetch popular stocks directly
  const fetchPopularStocks = async () => {
    console.log('🔄 Fetching popular stocks as fallback...');
    const popularSymbols = ['SPY', 'AAPL', 'MSFT', 'GOOGL', 'TSLA'];
    
    const stocksData = [];
    
    for (const symbol of popularSymbols) {
      try {
        const response = await fetch(`${BACKEND_URL}/market/quote/${symbol}`);
        const data = await response.json();
        
        if (data.success) {
          // Get confidence score from scan
          let confidence = 50;
          try {
            const scanResponse = await fetch(`${BACKEND_URL}/scan/stock/${symbol}`);
            const scanData = await scanResponse.json();
            if (scanData.success && scanData.confidence) {
              confidence = scanData.confidence;
            }
          } catch (scanError) {
            console.log(`No scan data for ${symbol}`);
          }
          
          stocksData.push({
            symbol: symbol,
            price: data.last,
            change: data.change,
            change_percentage: data.change_percentage,
            confidence: confidence,
            volume: data.volume,
            timestamp: data.timestamp
          });
        }
      } catch (err) {
        console.error(`Error fetching ${symbol}:`, err.message || err);
      }
    }
    
    if (stocksData.length > 0) {
      setStocks(stocksData);
    } else {
      // Last resort: mock data with note
      setStocks([
        { 
          symbol: 'AAPL', 
          price: 0, 
          change: 0, 
          change_percentage: 0, 
          confidence: 0,
          note: 'Using fallback data - check backend'
        }
      ]);
    }
  };

  // Search for a specific stock
  const searchStock = async () => {
    if (!searchSymbol.trim()) {
      Alert.alert('Error', 'Please enter a stock symbol');
      return;
    }
    
    const symbol = searchSymbol.trim().toUpperCase();
    setSearchLoading(true);
    
    try {
      // Get quote
      const quoteResponse = await fetch(`${BACKEND_URL}/market/quote/${symbol}`);
      const quoteData = await quoteResponse.json();
      
      if (!quoteData.success) {
        throw new Error(quoteData.error || 'Stock not found');
      }
      
      // Get scan data for confidence
      let confidence = 50;
      let scanDetails = {};
      try {
        const scanResponse = await fetch(`${BACKEND_URL}/scan/stock/${symbol}`);
        const scanData = await scanResponse.json();
        if (scanData.success) {
          confidence = scanData.confidence || 50;
          scanDetails = {
            unusual_volume: scanData.unusual_volume,
            volume_ratio: scanData.volume_ratio,
            implied_volatility: scanData.implied_volatility
          };
        }
      } catch (scanError) {
        console.log('No scan data available');
      }
      
      // Get options chain for more info
      let optionsCount = 0;
      try {
        const optionsResponse = await fetch(`${BACKEND_URL}/options/chain/${symbol}`);
        const optionsData = await optionsResponse.json();
        if (optionsData.success) {
          optionsCount = optionsData.count || 0;
        }
      } catch (optionsError) {
        console.log('No options data available');
      }
      
      setSearchResult({
        symbol: symbol,
        price: quoteData.last,
        change: quoteData.change,
        change_percentage: quoteData.change_percentage,
        confidence: confidence,
        volume: quoteData.volume,
        high: quoteData.high,
        low: quoteData.low,
        open: quoteData.open,
        timestamp: quoteData.timestamp,
        options_count: optionsCount,
        scan_details: scanDetails
      });
      
      setSearchModalVisible(true);
      
    } catch (err) {
      Alert.alert('Search Error', err.message || 'Failed to search for stock');
    } finally {
      setSearchLoading(false);
    }
  };

  // Add searched stock to recent scans
  const addToRecentScans = () => {
    if (searchResult) {
      // Check if already in list
      const exists = stocks.find(stock => stock.symbol === searchResult.symbol);
      if (!exists) {
        setStocks(prev => [searchResult, ...prev.slice(0, 4)]);
      }
      setSearchModalVisible(false);
      setSearchSymbol('');
      Alert.alert('Success', `${searchResult.symbol} added to recent scans`);
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
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      console.log('🔄 Auto-refreshing data...');
      fetchData();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Render loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Connecting to backend...</Text>
        <Text style={styles.loadingSubtext}>http://localhost:5000</Text>
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
        
        <View style={styles.connectionContainer}>
          <View style={[
            styles.connectionBadge, 
            backendConnected ? styles.connected : styles.disconnected
          ]}>
            <Text style={styles.connectionText}>
              {backendConnected ? '✅ Backend Connected' : '❌ Backend Disconnected'}
            </Text>
          </View>
          
          {apiStatus && (
            <View style={styles.apiInfo}>
              <Text style={styles.apiText}>API v{apiStatus.version}</Text>
              <Text style={styles.apiText}>Mode: {apiStatus.tradierMode}</Text>
              <Text style={styles.apiText}>
                Key: {apiStatus.apiKeyConfigured ? '✅' : '❌'}
              </Text>
            </View>
          )}
        </View>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search stock (e.g., AAPL, SPY)"
            placeholderTextColor="#999"
            value={searchSymbol}
            onChangeText={setSearchSymbol}
            onSubmitEditing={searchStock}
          />
          <TouchableOpacity 
            style={styles.searchButton}
            onPress={searchStock}
            disabled={searchLoading}
          >
            {searchLoading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.searchButtonText}>Search</Text>
            )}
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
            <TouchableOpacity onPress={fetchData} style={styles.emptyStateButton}>
              <Text style={styles.emptyStateButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          stocks.map((stock, index) => (
            <View key={index} style={styles.stockCard}>
              <View style={styles.stockHeader}>
                <View>
                  <Text style={styles.stockSymbol}>{stock.symbol}</Text>
                  {stock.timestamp && (
                    <Text style={styles.stockTimestamp}>
                      {new Date(stock.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </Text>
                  )}
                </View>
                <Text style={styles.stockPrice}>
                  ${typeof stock.price === 'number' ? stock.price.toFixed(2) : 'N/A'}
                </Text>
              </View>
              
              <View style={styles.stockDetails}>
                <View style={styles.changeContainer}>
                  <Text style={[
                    styles.stockChange, 
                    stock.change >= 0 ? styles.positive : styles.negative
                  ]}>
                    {stock.change >= 0 ? '+' : ''}{stock.change?.toFixed(2) || '0.00'} 
                    ({stock.change_percentage?.toFixed(2) || '0.00'}%)
                  </Text>
                  {stock.volume && (
                    <Text style={styles.stockVolume}>
                      Vol: {(stock.volume / 1000000).toFixed(1)}M
                    </Text>
                  )}
                </View>
                
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
              
              {/* Quick Actions */}
              <View style={styles.stockActions}>
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => {
                    setSearchSymbol(stock.symbol);
                    searchStock();
                  }}
                >
                  <Text style={styles.actionButtonText}>📊 Details</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => {
                    // Navigate to scan for this stock
                    Alert.alert('Scan', `Running scan for ${stock.symbol}...`);
                    // In production: navigate to scan screen
                  }}
                >
                  <Text style={styles.actionButtonText}>🔍 Rescan</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Advanced Trading Toggle */}
      <TouchableOpacity 
        style={styles.toggleButton}
        onPress={() => setShowAdvanced(!showAdvanced)}
      >
        <Text style={styles.toggleButtonText}>
          {showAdvanced ? '▼ Hide Advanced Trading' : '▶ Show Advanced Trading'}
        </Text>
      </TouchableOpacity>

      {/* Advanced Trading Component */}
      {showAdvanced && <AdvancedTrading backendUrl={BACKEND_URL} />}

      {/* Market Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Market Status</Text>
        <View style={styles.statusGrid}>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Stocks Loaded</Text>
            <Text style={styles.statusValue}>{stocks.length}</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Backend</Text>
            <Text style={[styles.statusValue, backendConnected ? styles.positive : styles.negative]}>
              {backendConnected ? 'Online' : 'Offline'}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={styles.statusLabel}>Last Updated</Text>
            <Text style={styles.statusValue}>
              {stocks[0]?.timestamp ? 
                new Date(stocks[0].timestamp).toLocaleTimeString() : 
                'Never'}
            </Text>
          </View>
        </View>
      </View>

      {/* Search Result Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={searchModalVisible}
        onRequestClose={() => setSearchModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {searchResult && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{searchResult.symbol}</Text>
                  <TouchableOpacity onPress={() => setSearchModalVisible(false)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                
                <View style={styles.modalBody}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Price:</Text>
                    <Text style={styles.modalValue}>${searchResult.price?.toFixed(2)}</Text>
                  </View>
                  
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Change:</Text>
                    <Text style={[
                      styles.modalValue,
                      searchResult.change >= 0 ? styles.positive : styles.negative
                    ]}>
                      {searchResult.change >= 0 ? '+' : ''}{searchResult.change?.toFixed(2)} 
                      ({searchResult.change_percentage?.toFixed(2)}%)
                    </Text>
                  </View>
                  
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Confidence:</Text>
                    <Text style={styles.modalValue}>{searchResult.confidence}%</Text>
                  </View>
                  
                  {searchResult.scan_details && (
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Scan Details</Text>
                      {searchResult.scan_details.volume_ratio && (
                        <Text style={styles.modalText}>
                          Volume Ratio: {searchResult.scan_details.volume_ratio.toFixed(2)}
                        </Text>
                      )}
                      {searchResult.scan_details.implied_volatility && (
                        <Text style={styles.modalText}>
                          IV: {(searchResult.scan_details.implied_volatility * 100).toFixed(1)}%
                        </Text>
                      )}
                    </View>
                  )}
                  
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Options</Text>
                    <Text style={styles.modalText}>
                      Available Contracts: {searchResult.options_count}
                    </Text>
                  </View>
                </View>
                
                <View style={styles.modalFooter}>
                  <TouchableOpacity 
                    style={styles.modalButton}
                    onPress={addToRecentScans}
                  >
                    <Text style={styles.modalButtonText}>Add to Recent Scans</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.secondaryButton]}
                    onPress={() => {
                      setShowAdvanced(true);
                      setSearchModalVisible(false);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Advanced Analysis</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
  connectionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  connectionBadge: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
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
    fontSize: 14,
  },
  apiInfo: {
    flexDirection: 'row',
    gap: 10,
  },
  apiText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: 'white',
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  searchButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  errorContainer: {
    margin: 15,
    padding: 15,
    backgroundColor: '#ffebee',
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#c62828',
    flex: 1,
  },
  retryText: {
    color: '#667eea',
    fontWeight: '600',
    marginLeft: 10,
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
  emptyState: {
    padding: 30,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 15,
  },
  emptyStateButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    color: 'white',
    fontWeight: '600',
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
  stockTimestamp: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  stockPrice: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2ecc71',
  },
  stockDetails: {
    marginBottom: 15,
  },
  changeContainer: {
    marginBottom: 10,
  },
  stockChange: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  positive: {
    color: '#2ecc71',
  },
  negative: {
    color: '#e74c3c',
  },
  stockVolume: {
    fontSize: 14,
    color: '#666',
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
  stockActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderRadius: 6,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#667eea',
    fontWeight: '600',
    fontSize: 14,
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
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  modalClose: {
    fontSize: 24,
    color: '#999',
  },
  modalBody: {
    marginBottom: 20,
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalLabel: {
    fontSize: 16,
    color: '#666',
  },
  modalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalSection: {
    marginTop: 15,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  modalSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  modalFooter: {
    marginTop: 20,
  },
  modalButton: {
    backgroundColor: '#667eea',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#667eea',
  },
  secondaryButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '600',
  },
});
