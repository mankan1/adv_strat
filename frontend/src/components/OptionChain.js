import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../config/constants';
import { 
  formatCurrency, 
  formatPercent, 
  formatGreek,
  getColorForValue,
  calculateOptionMetrics
} from '../utils/formatters';

const { width } = Dimensions.get('window');

const OptionChain = ({ 
  option, 
  underlyingPrice,
  onSelect,
  compact = false,
  showDetails = true
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  
  if (!option) return null;
  
  const { 
    strike, 
    type, 
    lastPrice, 
    bid, 
    ask, 
    volume, 
    openInterest,
    impliedVolatility,
    delta,
    theta,
    gamma,
    vega,
    confidence,
    reasons = []
  } = option;
  
  const metrics = calculateOptionMetrics(option, underlyingPrice);
  const isCall = type === 'call';
  const typeColor = isCall ? COLORS.BULLISH : COLORS.BEARISH;
  const typeLabel = isCall ? 'CALL' : 'PUT';
  
  const handlePress = () => {
    if (onSelect) {
      onSelect(option);
    } else if (showDetails) {
      setModalVisible(true);
    }
  };
  
  const renderCompactView = () => (
    <TouchableOpacity 
      style={[
        styles.compactCard,
        { borderLeftColor: typeColor }
      ]}
      onPress={handlePress}
    >
      <View style={styles.compactHeader}>
        <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
          <Text style={styles.typeBadgeText}>{typeLabel}</Text>
        </View>
        <Text style={styles.compactStrike}>{formatCurrency(strike, 0)}</Text>
      </View>
      
      <View style={styles.compactDetails}>
        <Text style={styles.compactPrice}>{formatCurrency(lastPrice)}</Text>
        <Text style={styles.compactVolume}>Vol: {volume.toLocaleString()}</Text>
      </View>
      
      {confidence !== undefined && (
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{confidence}%</Text>
        </View>
      )}
    </TouchableOpacity>
  );
  
  const renderFullView = () => (
    <TouchableOpacity 
      style={[
        styles.card,
        { borderLeftColor: typeColor }
      ]}
      onPress={handlePress}
    >
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
            <Text style={styles.typeBadgeText}>{typeLabel}</Text>
          </View>
          <Text style={styles.strike}>{formatCurrency(strike, 0)}</Text>
        </View>
        
        <View style={styles.headerRight}>
          <Text style={styles.price}>{formatCurrency(lastPrice)}</Text>
          {confidence !== undefined && (
            <View style={[
              styles.confidenceBadge,
              { backgroundColor: getColorForValue(confidence, 'confidence') }
            ]}>
              <Text style={styles.confidenceText}>{confidence}%</Text>
            </View>
          )}
        </View>
      </View>
      
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <Text style={styles.label}>Bid/Ask:</Text>
          <Text style={styles.value}>
            {formatCurrency(bid)} / {formatCurrency(ask)}
          </Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Spread:</Text>
          <Text style={[
            styles.value,
            { color: metrics.spreadPercent < 5 ? COLORS.BULLISH : COLORS.BEARISH }
          ]}>
            {formatCurrency(metrics.spread)} ({metrics.spreadPercent.toFixed(1)}%)
          </Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>Volume/OI:</Text>
          <Text style={styles.value}>
            {volume.toLocaleString()} / {openInterest.toLocaleString()}
          </Text>
        </View>
        
        <View style={styles.row}>
          <Text style={styles.label}>IV:</Text>
          <Text style={[
            styles.value,
            { color: impliedVolatility > 0.3 ? COLORS.BULLISH : COLORS.BEARISH }
          ]}>
            {formatGreek(impliedVolatility, 'iv')}
          </Text>
        </View>
        
        <View style={styles.greeksRow}>
          <View style={styles.greek}>
            <Text style={styles.greekLabel}>Δ</Text>
            <Text style={styles.greekValue}>{formatGreek(delta, 'delta')}</Text>
          </View>
          <View style={styles.greek}>
            <Text style={styles.greekLabel}>Γ</Text>
            <Text style={styles.greekValue}>{formatGreek(gamma, 'gamma')}</Text>
          </View>
          <View style={styles.greek}>
            <Text style={styles.greekLabel}>Θ</Text>
            <Text style={styles.greekValue}>{formatGreek(theta, 'theta')}</Text>
          </View>
          <View style={styles.greek}>
            <Text style={styles.greekLabel}>ν</Text>
            <Text style={styles.greekValue}>{formatGreek(vega, 'vega')}</Text>
          </View>
        </View>
        
        {metrics.isITM && (
          <View style={styles.itmBadge}>
            <Text style={styles.itmText}>In the Money</Text>
          </View>
        )}
        
        {reasons.length > 0 && (
          <View style={styles.reasonsContainer}>
            <Text style={styles.reasonsTitle}>Why it's unusual:</Text>
            {reasons.slice(0, 2).map((reason, idx) => (
              <Text key={idx} style={styles.reason}>
                • {reason}
              </Text>
            ))}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
  
  const renderDetailsModal = () => (
    <Modal
      animationType="slide"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => setModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {typeLabel} ${strike}
            </Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={24} color={COLORS.TEXT_PRIMARY} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Pricing</Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Last Price</Text>
                  <Text style={styles.detailValue}>{formatCurrency(lastPrice)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Bid</Text>
                  <Text style={styles.detailValue}>{formatCurrency(bid)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Ask</Text>
                  <Text style={styles.detailValue}>{formatCurrency(ask)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Spread</Text>
                  <Text style={[
                    styles.detailValue,
                    { color: metrics.spreadPercent < 5 ? COLORS.BULLISH : COLORS.BEARISH }
                  ]}>
                    {formatCurrency(metrics.spread)}
                  </Text>
                </View>
              </View>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Volume & Interest</Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Volume</Text>
                  <Text style={styles.detailValue}>{volume.toLocaleString()}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Open Interest</Text>
                  <Text style={styles.detailValue}>{openInterest.toLocaleString()}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Volume/OI Ratio</Text>
                  <Text style={styles.detailValue}>
                    {(volume / Math.max(openInterest, 1)).toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Greeks</Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Delta (Δ)</Text>
                  <Text style={styles.detailValue}>{formatGreek(delta, 'delta')}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Gamma (Γ)</Text>
                  <Text style={styles.detailValue}>{formatGreek(gamma, 'gamma')}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Theta (Θ)</Text>
                  <Text style={styles.detailValue}>{formatGreek(theta, 'theta')}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Vega (ν)</Text>
                  <Text style={styles.detailValue}>{formatGreek(vega, 'vega')}</Text>
                </View>
              </View>
            </View>
            
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Analysis</Text>
              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Moneyness</Text>
                <Text style={styles.analysisValue}>
                  {metrics.isATM ? 'At the Money' : 
                   metrics.isITM ? 'In the Money' : 'Out of the Money'}
                </Text>
                <Text style={styles.analysisSubtext}>
                  {metrics.percentFromMoney.toFixed(1)}% from current price
                </Text>
              </View>
              
              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Intrinsic Value</Text>
                <Text style={styles.analysisValue}>
                  {formatCurrency(metrics.intrinsicValue)}
                </Text>
              </View>
              
              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Time Value</Text>
                <Text style={styles.analysisValue}>
                  {formatCurrency(metrics.timeValue)}
                </Text>
              </View>
              
              <View style={styles.analysisItem}>
                <Text style={styles.analysisLabel}>Implied Volatility</Text>
                <Text style={styles.analysisValue}>
                  {formatGreek(impliedVolatility, 'iv')}
                </Text>
                <Text style={styles.analysisSubtext}>
                  {impliedVolatility > 0.4 ? 'High' : 
                   impliedVolatility > 0.25 ? 'Average' : 'Low'}
                </Text>
              </View>
            </View>
            
            {reasons.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Unusual Activity Indicators</Text>
                {reasons.map((reason, idx) => (
                  <View key={idx} style={styles.reasonItem}>
                    <Ionicons name="alert-circle" size={16} color={COLORS.WARNING} />
                    <Text style={styles.reasonText}>{reason}</Text>
                  </View>
                ))}
              </View>
            )}
            
            {confidence !== undefined && (
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Confidence Score</Text>
                <View style={styles.confidenceMeter}>
                  <View 
                    style={[
                      styles.confidenceFill,
                      { 
                        width: `${confidence}%`,
                        backgroundColor: getColorForValue(confidence, 'confidence')
                      }
                    ]}
                  />
                </View>
                <Text style={styles.confidenceText}>
                  {confidence >= 80 ? 'High Confidence' :
                   confidence >= 60 ? 'Moderate Confidence' :
                   confidence >= 40 ? 'Low Confidence' : 'Very Low Confidence'}
                </Text>
              </View>
            )}
          </ScrollView>
          
          <View style={styles.modalFooter}>
            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
  
  return (
    <>
      {compact ? renderCompactView() : renderFullView()}
      {renderDetailsModal()}
    </>
  );
};

const OptionChainList = ({ 
  options = [], 
  underlyingPrice,
  type = 'call',
  onSelectOption,
  showHeaders = true
}) => {
  const filteredOptions = options.filter(opt => opt.type === type);
  
  if (filteredOptions.length === 0) {
    return (
      <View style={styles.emptyList}>
        <Text style={styles.emptyText}>
          No {type === 'call' ? 'call' : 'put'} options found
        </Text>
      </View>
    );
  }
  
  return (
    <View style={styles.listContainer}>
      {showHeaders && (
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {type === 'call' ? '📈 Calls' : '📉 Puts'} ({filteredOptions.length})
          </Text>
        </View>
      )}
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listScroll}
      >
        {filteredOptions.map((option, index) => (
          <OptionChain
            key={index}
            option={option}
            underlyingPrice={underlyingPrice}
            onSelect={onSelectOption}
            compact={true}
            showDetails={true}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  // Compact View Styles
  compactCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    minWidth: 120,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  compactStrike: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY
  },
  compactDetails: {
    marginBottom: 8
  },
  compactPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4
  },
  compactVolume: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY
  },
  
  // Full View Styles
  card: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  headerRight: {
    alignItems: 'flex-end'
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8
  },
  typeBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold'
  },
  strike: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY
  },
  price: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10
  },
  confidenceText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold'
  },
  cardBody: {
    marginTop: 8
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  label: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY
  },
  value: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.TEXT_PRIMARY
  },
  greeksRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)'
  },
  greek: {
    alignItems: 'center'
  },
  greekLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 2
  },
  greekValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY
  },
  itmBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 8
  },
  itmText: {
    color: COLORS.BULLISH,
    fontSize: 12,
    fontWeight: '600'
  },
  reasonsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)'
  },
  reasonsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4
  },
  reason: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 2,
    fontStyle: 'italic'
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: COLORS.BACKGROUND,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY
  },
  modalBody: {
    padding: 20,
    maxHeight: '80%'
  },
  detailSection: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 16
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8
  },
  detailItem: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16
  },
  detailLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 4
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY
  },
  analysisItem: {
    marginBottom: 16
  },
  analysisLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 4
  },
  analysisValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 2
  },
  analysisSubtext: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  reasonText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.TEXT_PRIMARY,
    marginLeft: 8
  },
  confidenceMeter: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    marginVertical: 8
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 4
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER
  },
  modalButton: {
    backgroundColor: COLORS.INFO,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center'
  },
  modalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  },
  
  // List Styles
  listContainer: {
    marginVertical: 12
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4
  },
  listTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY
  },
  listScroll: {
    paddingRight: 16
  },
  emptyList: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12
  },
  emptyText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 16
  }
});

export { OptionChain, OptionChainList };
export default OptionChain;
