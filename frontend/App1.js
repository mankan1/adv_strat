import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  StatusBar
} from 'react-native';

// Simple API test
const testBackend = async () => {
  try {
    const response = await fetch('http://localhost:5000/health');
    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState(null);
  const [scans, setScans] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    // Test backend connection
    const status = await testBackend();
    setBackendStatus(status);
    
    // Load mock scans
    setScans([
      { symbol: 'AAPL', price: 185.25, change: '+1.25%', confidence: 85 },
      { symbol: 'MSFT', price: 385.45, change: '+0.85%', confidence: 72 },
      { symbol: 'NVDA', price: 495.22, change: '+3.45%', confidence: 91 },
      { symbol: 'TSLA', price: 245.67, change: '+2.15%', confidence: 68 },
      { symbol: 'GOOGL', price: 142.30, change: '-0.25%', confidence: 55 },
    ]);
    
    setLoading(false);
  };

  const renderStatus = () => {
    if (!backendStatus) return null;
    
    return (
      <View style={[
        styles.statusCard,
        { backgroundColor: backendStatus.success ? '#4CAF50' : '#F44336' }
      ]}>
        <Text style={styles.statusText}>
          {backendStatus.success ? '✅ Backend Connected' : '❌ Backend Error'}
        </Text>
        <Text style={styles.statusSubtext}>
          {backendStatus.success 
            ? `API Version: ${backendStatus.data?.version || '1.0.0'}` 
            : backendStatus.error}
        </Text>
      </View>
    );
  };

  const renderScanCard = (scan, index) => (
    <View key={index} style={styles.scanCard}>
      <View style={styles.scanHeader}>
        <Text style={styles.symbol}>{scan.symbol}</Text>
        <Text style={styles.price}>${scan.price.toFixed(2)}</Text>
      </View>
      <View style={styles.scanDetails}>
        <Text style={[
          styles.change,
          { color: scan.change.startsWith('+') ? '#4CAF50' : '#F44336' }
        ]}>
          {scan.change}
        </Text>
        <View style={[
          styles.confidenceBadge,
          { backgroundColor: scan.confidence >= 80 ? '#4CAF50' : 
                          scan.confidence >= 60 ? '#FF9800' : '#F44336' }
        ]}>
          <Text style={styles.confidenceText}>
            {scan.confidence}% Confidence
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      
      <View style={styles.header}>
        <Text style={styles.title}>Options Scanner</Text>
        <Text style={styles.subtitle}>Real-time options analysis</Text>
      </View>

      {renderStatus()}

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Scans</Text>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#4A90E2" />
              <Text style={styles.loadingText}>Loading data...</Text>
            </View>
          ) : (
            <>
              {scans.map(renderScanCard)}
              
              <TouchableOpacity 
                style={styles.scanButton}
                onPress={loadData}
                disabled={loading}
              >
                <Text style={styles.scanButtonText}>
                  {loading ? 'Scanning...' : 'Run New Scan'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Quick Start</Text>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>
              Ensure backend is running on port 5000
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>
              Add your Tradier API key to backend/.env
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoBullet}>•</Text>
            <Text style={styles.infoText}>
              Run "npm run dev" in backend directory
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Options Scanner v1.0.0
        </Text>
        <Text style={styles.footerText}>
          Backend: http://localhost:5000
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  header: {
    backgroundColor: '#1a1a2e',
    padding: 24,
    paddingTop: 60,
    paddingBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#B0B0B0',
  },
  statusCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    marginTop: -10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 14,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#B0B0B0',
    fontSize: 16,
    marginTop: 12,
  },
  scanCard: {
    backgroundColor: '#1e1e3a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  symbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  price: {
    fontSize: 20,
    fontWeight: '600',
    color: '#4CAF50',
  },
  scanDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  change: {
    fontSize: 16,
    fontWeight: '600',
  },
  confidenceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  confidenceText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  scanButton: {
    backgroundColor: '#4A90E2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  scanButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  infoSection: {
    backgroundColor: '#1e1e3a',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoBullet: {
    color: '#4A90E2',
    fontSize: 16,
    marginRight: 12,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    color: '#B0B0B0',
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    padding: 16,
    backgroundColor: '#1a1a2e',
    alignItems: 'center',
  },
  footerText: {
    color: '#B0B0B0',
    fontSize: 12,
    marginVertical: 2,
  },
});
