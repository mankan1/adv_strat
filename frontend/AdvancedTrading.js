import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Picker
} from 'react-native';

const AdvancedTrading = ({ backendUrl = 'http://localhost:5000' }) => {
  const [symbol, setSymbol] = useState('SPY');
  const [strategy, setStrategy] = useState('vertical-spread');
  const [expirations, setExpirations] = useState([]);
  const [selectedExpiration, setSelectedExpiration] = useState('');
  const [quote, setQuote] = useState(null);
  const [optionsChain, setOptionsChain] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [legs, setLegs] = useState([
    { id: 1, type: 'call', position: 'long', strike: 0, quantity: 1 },
    { id: 2, type: 'call', position: 'short', strike: 0, quantity: 1 }
  ]);

  const strategies = [
    { id: 'vertical-spread', name: 'Vertical Spread', legs: 2 },
    { id: 'iron-condor', name: 'Iron Condor', legs: 4 },
    { id: 'strangle', name: 'Strangle', legs: 2 },
    { id: 'straddle', name: 'Straddle', legs: 2 },
    { id: 'butterfly', name: 'Butterfly', legs: 3 },
    { id: 'calendar-spread', name: 'Calendar Spread', legs: 2 },
  ];

  // Load initial data
  useEffect(() => {
    if (symbol) {
      loadUnderlyingData();
    }
  }, [symbol]);

  // Update legs when strategy changes
  useEffect(() => {
    applyStrategyTemplate(strategy);
  }, [strategy, quote]);

  // Update strikes when quote changes
  useEffect(() => {
    if (quote && quote.last) {
      updateLegStrikes(quote.last);
    }
  }, [quote]);

  const loadUnderlyingData = async () => {
    try {
      // Load quote
      const quoteResponse = await fetch(`${backendUrl}/market/quote/${symbol}`);
      const quoteData = await quoteResponse.json();
      
      if (quoteData.success) {
        setQuote(quoteData);
      } else {
        Alert.alert('Error', `Failed to load quote for ${symbol}: ${quoteData.error}`);
        return;
      }

      // Load expirations
      const expResponse = await fetch(`${backendUrl}/options/expirations/${symbol}`);
      const expData = await expResponse.json();
      
      if (expData.success && expData.expirations && expData.expirations.length > 0) {
        setExpirations(expData.expirations);
        setSelectedExpiration(expData.expirations[0]);
      } else {
        Alert.alert('Warning', 'No expiration dates available');
      }

    } catch (error) {
      Alert.alert('Error', `Failed to load data: ${error.message}`);
    }
  };

  const loadOptionsChain = async () => {
    if (!selectedExpiration) {
      Alert.alert('Error', 'Please select an expiration date');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(
        `${backendUrl}/options/chain/${symbol}?expiration=${selectedExpiration}`
      );
      const data = await response.json();
      
      if (data.success) {
        setOptionsChain(data.options || []);
      } else {
        Alert.alert('Error', `Failed to load options chain: ${data.error}`);
      }
    } catch (error) {
      Alert.alert('Error', `Failed to load options chain: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const applyStrategyTemplate = (strategyId) => {
    if (!quote) return;

    const currentPrice = quote.last;
    let newLegs = [];

    switch (strategyId) {
      case 'vertical-spread':
        newLegs = [
          { id: 1, type: 'call', position: 'long', strike: Math.round(currentPrice * 0.98), quantity: 1 },
          { id: 2, type: 'call', position: 'short', strike: Math.round(currentPrice * 1.02), quantity: 1 }
        ];
        break;
      case 'iron-condor':
        newLegs = [
          { id: 1, type: 'put', position: 'short', strike: Math.round(currentPrice * 0.95), quantity: 1 },
          { id: 2, type: 'put', position: 'long', strike: Math.round(currentPrice * 0.90), quantity: 1 },
          { id: 3, type: 'call', position: 'short', strike: Math.round(currentPrice * 1.05), quantity: 1 },
          { id: 4, type: 'call', position: 'long', strike: Math.round(currentPrice * 1.10), quantity: 1 }
        ];
        break;
      case 'strangle':
        newLegs = [
          { id: 1, type: 'put', position: 'long', strike: Math.round(currentPrice * 0.90), quantity: 1 },
          { id: 2, type: 'call', position: 'long', strike: Math.round(currentPrice * 1.10), quantity: 1 }
        ];
        break;
      case 'straddle':
        newLegs = [
          { id: 1, type: 'put', position: 'long', strike: Math.round(currentPrice), quantity: 1 },
          { id: 2, type: 'call', position: 'long', strike: Math.round(currentPrice), quantity: 1 }
        ];
        break;
      default:
        newLegs = legs;
    }

    setLegs(newLegs);
  };

  const updateLegStrikes = (currentPrice) => {
    setLegs(prevLegs => 
      prevLegs.map(leg => {
        // Only update if strike is 0 (uninitialized)
        if (leg.strike === 0) {
          switch (strategy) {
            case 'vertical-spread':
              if (leg.position === 'long') {
                return { ...leg, strike: Math.round(currentPrice * 0.98) };
              } else {
                return { ...leg, strike: Math.round(currentPrice * 1.02) };
              }
            default:
              return leg;
          }
        }
        return leg;
      })
    );
  };

  const updateLeg = (id, field, value) => {
    setLegs(legs.map(leg => 
      leg.id === id ? { ...leg, [field]: value } : leg
    ));
  };

  const analyzeStrategy = async () => {
    if (!quote || !selectedExpiration) {
      Alert.alert('Error', 'Please load underlying data first');
      return;
    }

    setLoading(true);
    try {
      // First, get the options chain
      await loadOptionsChain();
      
      if (optionsChain.length === 0) {
        Alert.alert('Error', 'No options data available for analysis');
        return;
      }

      // Analyze each leg
      const analyzedLegs = await Promise.all(
        legs.map(async (leg) => {
          const option = optionsChain.find(o => 
            o.type === leg.type && 
            Math.abs(o.strike - leg.strike) < 0.01
          );

          if (option) {
            return {
              ...leg,
              bid: option.bid,
              ask: option.ask,
              mid: (option.bid + option.ask) / 2,
              delta: option.delta || 0,
              gamma: option.gamma || 0,
              theta: option.theta || 0,
              vega: option.vega || 0,
              iv: option.iv || 0
            };
          }

          // If option not found, use estimated values
          const distance = Math.abs(leg.strike - quote.last) / quote.last;
          const estimatedPrice = quote.last * 0.01 * Math.exp(-distance * 10);
          
          return {
            ...leg,
            bid: estimatedPrice,
            ask: estimatedPrice * 1.1,
            mid: estimatedPrice * 1.05,
            delta: leg.type === 'call' ? 0.5 : -0.5,
            theta: -0.05,
            vega: 0.15
          };
        })
      );

      // Calculate strategy metrics
      let netPremium = 0;
      let maxProfit = 0;
      let maxLoss = 0;
      let totalDelta = 0;
      let totalTheta = 0;
      let totalVega = 0;

      analyzedLegs.forEach(leg => {
        const legCost = (leg.mid || 0) * leg.quantity * 100;
        const multiplier = leg.position === 'long' ? -1 : 1;
        
        netPremium += (legCost * multiplier);
        totalDelta += (leg.delta || 0) * leg.quantity * multiplier;
        totalTheta += (leg.theta || 0) * leg.quantity * multiplier;
        totalVega += (leg.vega || 0) * leg.quantity * multiplier;
      });

      // Simple P/L calculation
      const plData = calculatePLData(analyzedLegs, quote.last);

      setAnalysis({
        netPremium: netPremium.toFixed(2),
        maxProfit: maxProfit.toFixed(2),
        maxLoss: maxLoss.toFixed(2),
        greeks: {
          delta: totalDelta.toFixed(3),
          theta: totalTheta.toFixed(2),
          vega: totalVega.toFixed(2)
        },
        legs: analyzedLegs,
        plData,
        probability: calculateProbability(analyzedLegs, quote.last)
      });

    } catch (error) {
      Alert.alert('Error', `Analysis failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const calculatePLData = (legs, currentPrice) => {
    const data = [];
    const range = currentPrice * 0.3;
    const steps = 20;

    for (let i = 0; i <= steps; i++) {
      const price = currentPrice - range + (2 * range * i / steps);
      let totalPL = 0;

      legs.forEach(leg => {
        let legPL = 0;
        const multiplier = leg.position === 'long' ? 1 : -1;
        const premium = leg.mid || 0;

        if (leg.type === 'call') {
          if (price > leg.strike) {
            legPL = (price - leg.strike - premium) * 100 * multiplier;
          } else {
            legPL = -premium * 100 * multiplier;
          }
        } else {
          if (price < leg.strike) {
            legPL = (leg.strike - price - premium) * 100 * multiplier;
          } else {
            legPL = -premium * 100 * multiplier;
          }
        }

        totalPL += legPL * leg.quantity;
      });

      data.push({
        price: price.toFixed(2),
        pl: totalPL.toFixed(2)
      });
    }

    return data;
  };

  const calculateProbability = (legs, currentPrice) => {
    // Simplified probability calculation
    let totalDelta = 0;
    
    legs.forEach(leg => {
      const multiplier = leg.position === 'long' ? 1 : -1;
      totalDelta += (leg.delta || 0) * leg.quantity * multiplier;
    });
    
    const baseProb = 50;
    const deltaImpact = totalDelta * 20;
    return Math.max(5, Math.min(95, baseProb + deltaImpact)).toFixed(0);
  };

  const renderStrategyMetrics = () => {
    if (!analysis) return null;

    return (
      <View style={styles.analysisSection}>
        <Text style={styles.analysisTitle}>Strategy Analysis</Text>
        
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Net Premium</Text>
            <Text style={[
              styles.metricValue,
              parseFloat(analysis.netPremium) >= 0 ? styles.positive : styles.negative
            ]}>
              ${analysis.netPremium}
            </Text>
          </View>
          
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Probability</Text>
            <Text style={styles.metricValue}>{analysis.probability}%</Text>
          </View>
        </View>

        <View style={styles.greeksSection}>
          <Text style={styles.greeksTitle}>Greeks</Text>
          <View style={styles.greeksGrid}>
            <View style={styles.greekCard}>
              <Text style={styles.greekSymbol}>Δ</Text>
              <Text style={styles.greekValue}>{analysis.greeks.delta}</Text>
              <Text style={styles.greekLabel}>Delta</Text>
            </View>
            <View style={styles.greekCard}>
              <Text style={styles.greekSymbol}>Θ</Text>
              <Text style={styles.greekValue}>{analysis.greeks.theta}</Text>
              <Text style={styles.greekLabel}>Theta</Text>
            </View>
            <View style={styles.greekCard}>
              <Text style={styles.greekSymbol}>ν</Text>
              <Text style={styles.greekValue}>{analysis.greeks.vega}</Text>
              <Text style={styles.greekLabel}>Vega</Text>
            </View>
          </View>
        </View>

        <View style={styles.legsSection}>
          <Text style={styles.legsTitle}>Strategy Legs</Text>
          {analysis.legs.map((leg, index) => (
            <View key={index} style={styles.legRow}>
              <Text style={styles.legText}>
                {leg.position.toUpperCase()} {leg.type.toUpperCase()} ${leg.strike}
              </Text>
              <Text style={styles.legText}>${leg.mid?.toFixed(2) || '0.00'}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.title}>Advanced Options Trading</Text>
        
        {/* Symbol Input */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Symbol</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={symbol}
              onChangeText={setSymbol}
              placeholder="Enter symbol"
            />
            <TouchableOpacity style={styles.loadButton} onPress={loadUnderlyingData}>
              <Text style={styles.loadButtonText}>Load</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Quote Display */}
        {quote && (
          <View style={styles.quoteContainer}>
            <Text style={styles.quoteSymbol}>{symbol}</Text>
            <Text style={styles.quotePrice}>${quote.last?.toFixed(2)}</Text>
            <Text style={[
              styles.quoteChange,
              quote.change >= 0 ? styles.positive : styles.negative
            ]}>
              {quote.change >= 0 ? '+' : ''}{quote.change?.toFixed(2)} ({quote.change_percentage?.toFixed(2)}%)
            </Text>
          </View>
        )}

        {/* Strategy Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Strategy</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {strategies.map((strat) => (
              <TouchableOpacity
                key={strat.id}
                style={[
                  styles.strategyButton,
                  strategy === strat.id && styles.strategyButtonActive
                ]}
                onPress={() => setStrategy(strat.id)}
              >
                <Text style={[
                  styles.strategyButtonText,
                  strategy === strat.id && styles.strategyButtonTextActive
                ]}>
                  {strat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Expiration Selection */}
        {expirations.length > 0 && (
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Expiration</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selectedExpiration}
                onValueChange={(value) => setSelectedExpiration(value)}
                style={styles.picker}
              >
                {expirations.map((exp, index) => (
                  <Picker.Item key={index} label={exp} value={exp} />
                ))}
              </Picker>
            </View>
          </View>
        )}

        {/* Strategy Legs */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Strategy Legs</Text>
          {legs.map((leg) => (
            <View key={leg.id} style={styles.legCard}>
              <View style={styles.legHeader}>
                <Text style={styles.legTitle}>Leg {leg.id}</Text>
              </View>
              <View style={styles.legControls}>
                <View style={styles.legControl}>
                  <Text style={styles.legLabel}>Type</Text>
                  <Picker
                    selectedValue={leg.type}
                    onValueChange={(value) => updateLeg(leg.id, 'type', value)}
                    style={styles.legPicker}
                  >
                    <Picker.Item label="Call" value="call" />
                    <Picker.Item label="Put" value="put" />
                  </Picker>
                </View>
                <View style={styles.legControl}>
                  <Text style={styles.legLabel}>Position</Text>
                  <Picker
                    selectedValue={leg.position}
                    onValueChange={(value) => updateLeg(leg.id, 'position', value)}
                    style={styles.legPicker}
                  >
                    <Picker.Item label="Long" value="long" />
                    <Picker.Item label="Short" value="short" />
                  </Picker>
                </View>
                <View style={styles.legControl}>
                  <Text style={styles.legLabel}>Strike</Text>
                  <TextInput
                    style={styles.legInput}
                    value={leg.strike.toString()}
                    onChangeText={(value) => updateLeg(leg.id, 'strike', parseFloat(value) || 0)}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.legControl}>
                  <Text style={styles.legLabel}>Qty</Text>
                  <TextInput
                    style={styles.legInput}
                    value={leg.quantity.toString()}
                    onChangeText={(value) => updateLeg(leg.id, 'quantity', parseInt(value) || 1)}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.analyzeButton}
            onPress={analyzeStrategy}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.analyzeButtonText}>Analyze Strategy</Text>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.resetButton}
            onPress={() => {
              setAnalysis(null);
              applyStrategyTemplate(strategy);
            }}
          >
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Analysis Results */}
        {renderStrategyMetrics()}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  section: {
    backgroundColor: 'white',
    margin: 15,
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  loadButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    borderRadius: 8,
    justifyContent: 'center',
  },
  loadButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  quoteContainer: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  quoteSymbol: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  quotePrice: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2ecc71',
    marginVertical: 5,
  },
  quoteChange: {
    fontSize: 16,
    fontWeight: '600',
  },
  positive: {
    color: '#2ecc71',
  },
  negative: {
    color: '#e74c3c',
  },
  strategyButton: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    marginRight: 10,
  },
  strategyButtonActive: {
    backgroundColor: '#667eea',
  },
  strategyButtonText: {
    fontSize: 14,
    color: '#666',
  },
  strategyButtonTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  legCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  legHeader: {
    marginBottom: 10,
  },
  legTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  legControls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legControl: {
    flex: 1,
    minWidth: 100,
  },
  legLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  legPicker: {
    height: 40,
    backgroundColor: 'white',
    borderRadius: 6,
  },
  legInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    padding: 8,
    backgroundColor: 'white',
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  analyzeButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  analyzeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  analysisSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  analysisTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  greeksSection: {
    marginBottom: 20,
  },
  greeksTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 10,
  },
  greeksGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  greekCard: {
    flex: 1,
    backgroundColor: '#f0f7ff',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  greekSymbol: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  greekValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginVertical: 5,
  },
  greekLabel: {
    fontSize: 12,
    color: '#666',
  },
  legsSection: {
    marginTop: 10,
  },
  legsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 10,
  },
  legRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  legText: {
    fontSize: 14,
    color: '#333',
  },
});

export default AdvancedTrading;
