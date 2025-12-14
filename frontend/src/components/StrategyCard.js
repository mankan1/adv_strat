import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Share
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { COLORS } from '../config/constants';
import { formatCurrency, formatPercent, formatStrategy } from '../utils/formatters';

const StrategyCard = ({ 
  strategy, 
  onSelect,
  showDetails = true,
  compact = false
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  
  if (!strategy) return null;
  
  const { 
    type, 
    name, 
    probability, 
    maxProfit, 
    maxLoss, 
    breakeven,
    legs = [],
    description,
    greeks
  } = strategy;
  
  const strategyInfo = formatStrategy(type);
  const displayName = name || strategyInfo.name;
  const displayDescription = description || strategyInfo.description;
  
  const getStrategyColor = () => {
    switch (type) {
      case 'IRON_CONDOR':
      case 'CALENDAR_SPREAD':
        return COLORS.INFO;
      case 'VERTICAL_SPREAD':
      case 'DIAGONAL_SPREAD':
        return probability > 50 ? COLORS.BULLISH : COLORS.BEARISH;
      case 'STRADDLE':
      case 'STRANGLE':
        return COLORS.WARNING;
      case 'BUTTERFLY':
        return '#9C27B0';
      default:
        return COLORS.NEUTRAL;
    }
  };
  
  const getStrategyIcon = () => {
    switch (type) {
      case 'IRON_CONDOR':
        return 'layers';
      case 'VERTICAL_SPREAD':
        return 'trending-up';
      case 'STRADDLE':
        return 'swap-horiz';
      case 'CALENDAR_SPREAD':
        return 'calendar';
      case 'BUTTERFLY':
        return 'waves';
      default:
        return 'schema';
    }
  };
  
  const handlePress = () => {
    if (onSelect) {
      onSelect(strategy);
    } else if (showDetails) {
      setModalVisible(true);
    }
  };
  
  const handleShare = async () => {
    try {
      const shareContent = {
        message: `Check out this options strategy: ${displayName}\n` +
                 `Probability: ${probability}%\n` +
                 `Max Profit: $${maxProfit}\n` +
                 `Max Loss: $${maxLoss}`,
        title: 'Options Strategy'
      };
      
      await Share.share(shareContent);
    } catch (error) {
      console.error('Error sharing strategy:', error);
    }
  };
  
  const renderCompactView = () => (
    <TouchableOpacity 
      style={[
        styles.compactCard,
        { borderLeftColor: getStrategyColor() }
      ]}
      onPress={handlePress}
    >
      <View style={styles.compactHeader}>
        <View style={[styles.compactIcon, { backgroundColor: getStrategyColor() }]}>
          <MaterialIcons name={getStrategyIcon()} size={20} color="white" />
        </View>
        <View style={styles.compactTitleContainer}>
          <Text style={styles.compactTitle} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.compactType} numberOfLines={1}>
            {type.replace('_', ' ')}
          </Text>
        </View>
      </View>
      
      <View style={styles.compactStats}>
        <View style={styles.compactStat}>
          <Text style={styles.compactStatLabel}>Prob</Text>
          <Text style={[
            styles.compactStatValue,
            { color: probability >= 60 ? COLORS.BULLISH : COLORS.NEUTRAL }
          ]}>
            {probability}%
          </Text>
        </View>
        
        <View style={styles.compactStat}>
          <Text style={styles.compactStatLabel}>Profit</Text>
          <Text style={[styles.compactStatValue, { color: COLORS.BULLISH }]}>
            ${maxProfit}
          </Text>
        </View>
        
        <View style={styles.compactStat}>
          <Text style={styles.compactStatLabel}>Risk</Text>
          <Text style={[styles.compactStatValue, { color: COLORS.BEARISH }]}>
            ${maxLoss}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
  
  const renderFullView = () => (
    <TouchableOpacity 
      style={[
        styles.card,
        { borderLeftColor: getStrategyColor() }
      ]}
      onPress={handlePress}
    >
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconContainer, { backgroundColor: getStrategyColor() }]}>
            <MaterialIcons name={getStrategyIcon()} size={24} color="white" />
          </View>
          <View>
            <Text style={styles.title}>{displayName}</Text>
            <Text style={styles.subtitle}>{type.replace('_', ' ')}</Text>
          </View>
        </View>
        
        <View style={styles.probabilityBadge}>
          <Text style={styles.probabilityText}>{probability}%</Text>
          <Text style={styles.probabilityLabel}>Prob</Text>
        </View>
      </View>
      
      <Text style={styles.description} numberOfLines={2}>
        {displayDescription}
      </Text>
      
      <View style={styles.statsContainer}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Max Profit</Text>
          <Text style={[styles.statValue, { color: COLORS.BULLISH }]}>
            ${maxProfit}
          </Text>
        </View>
        
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Max Loss</Text>
          <Text style={[styles.statValue, { color: COLORS.BEARISH }]}>
            ${maxLoss}
          </Text>
        </View>
        
        {breakeven && (
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Breakeven</Text>
            <Text style={styles.statValue}>
              {Array.isArray(breakeven) ? breakeven.join(', ') : breakeven}
            </Text>
          </View>
        )}
      </View>
      
      {legs.length > 0 && (
        <View style={styles.legsContainer}>
          <Text style={styles.legsTitle}>Legs ({legs.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {legs.slice(0, 3).map((leg, idx) => (
              <View key={idx} style={styles.legBadge}>
                <Text style={styles.legText}>
                  {leg.type === 'call' ? 'C' : 'P'} ${leg.strike}
                </Text>
              </View>
            ))}
            {legs.length > 3 && (
              <View style={styles.moreLegsBadge}>
                <Text style={styles.moreLegsText}>+{legs.length - 3}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      )}
      
      <View style={styles.cardFooter}>
        <TouchableOpacity 
          style={styles.detailsButton}
          onPress={handlePress}
        >
          <Text style={styles.detailsButtonText}>View Details</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.INFO} />
        </TouchableOpacity>
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
            <View style={styles.modalTitleContainer}>
              <View style={[styles.modalIcon, { backgroundColor: getStrategyColor() }]}>
                <MaterialIcons name={getStrategyIcon()} size={24} color="white" />
              </View>
              <View>
                <Text style={styles.modalTitle}>{displayName}</Text>
                <Text style={styles.modalSubtitle}>{type.replace('_', ' ')}</Text>
              </View>
            </View>
            
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
                <Ionicons name="share-outline" size={20} color={COLORS.TEXT_PRIMARY} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.actionButton}>
                <Ionicons name="close" size={24} color={COLORS.TEXT_PRIMARY} />
              </TouchableOpacity>
            </View>
          </View>
          
          <ScrollView style={styles.modalBody}>
            <View style={styles.modalSection}>
              <Text style={styles.sectionTitle}>Strategy Overview</Text>
              <Text style={styles.modalDescription}>
                {displayDescription}
              </Text>
            </View>
            
            <View style={styles.modalSection}>
              <Text style={styles.sectionTitle}>Key Metrics</Text>
              <View style={styles.metricsGrid}>
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Probability</Text>
                  <Text style={[
                    styles.metricValue,
                    { color: probability >= 60 ? COLORS.BULLISH : COLORS.NEUTRAL }
                  ]}>
                    {probability}%
                  </Text>
                  <Text style={styles.metricHint}>
                    {probability >= 70 ? 'High' : 
                     probability >= 50 ? 'Moderate' : 'Low'} success chance
                  </Text>
                </View>
                
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Max Profit</Text>
                  <Text style={[styles.metricValue, { color: COLORS.BULLISH }]}>
                    ${maxProfit}
                  </Text>
                  <Text style={styles.metricHint}>
                    Maximum potential profit
                  </Text>
                </View>
                
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Max Loss</Text>
                  <Text style={[styles.metricValue, { color: COLORS.BEARISH }]}>
                    ${maxLoss}
                  </Text>
                  <Text style={styles.metricHint}>
                    Maximum potential loss
                  </Text>
                </View>
                
                <View style={styles.metric}>
                  <Text style={styles.metricLabel}>Risk/Reward</Text>
                  <Text style={styles.metricValue}>
                    1:{maxLoss > 0 ? (maxProfit / maxLoss).toFixed(1) : '∞'}
                  </Text>
                  <Text style={styles.metricHint}>
                    Profit per dollar risked
                  </Text>
                </View>
              </View>
            </View>
            
            {breakeven && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionTitle}>Breakeven Points</Text>
                <View style={styles.breakevenContainer}>
                  {Array.isArray(breakeven) ? (
                    breakeven.map((point, idx) => (
                      <View key={idx} style={styles.breakevenPoint}>
                        <Ionicons name="location" size={16} color={COLORS.INFO} />
                        <Text style={styles.breakevenText}>${point}</Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.breakevenPoint}>
                      <Ionicons name="location" size={16} color={COLORS.INFO} />
                      <Text style={styles.breakevenText}>${breakeven}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            
            {greeks && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionTitle}>Greek Exposures</Text>
                <View style={styles.greeksContainer}>
                  {greeks.delta && (
                    <View style={styles.greekItem}>
                      <Text style={styles.greekLabel}>Delta (Δ)</Text>
                      <Text style={styles.greekValue}>{greeks.delta}</Text>
                    </View>
                  )}
                  {greeks.gamma && (
                    <View style={styles.greekItem}>
                      <Text style={styles.greekLabel}>Gamma (Γ)</Text>
                      <Text style={styles.greekValue}>{greeks.gamma}</Text>
                    </View>
                  )}
                  {greeks.theta && (
                    <View style={styles.greekItem}>
                      <Text style={styles.greekLabel}>Theta (Θ)</Text>
                      <Text style={styles.greekValue}>{greeks.theta}</Text>
                    </View>
                  )}
                  {greeks.vega && (
                    <View style={styles.greekItem}>
                      <Text style={styles.greekLabel}>Vega (ν)</Text>
                      <Text style={styles.greekValue}>{greeks.vega}</Text>
                    </View>
                  )}
                </View>
              </View>
            )}
            
            {legs.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionTitle}>Strategy Legs</Text>
                <Text style={styles.legsCount}>{legs.length} position{legs.length !== 1 ? 's' : ''}</Text>
                
                {legs.map((leg, idx) => (
                  <View key={idx} style={styles.legDetail}>
                    <View style={styles.legHeader}>
                      <View style={[
                        styles.legTypeBadge,
                        { backgroundColor: leg.type === 'call' ? COLORS.BULLISH : COLORS.BEARISH }
                      ]}>
                        <Text style={styles.legTypeText}>
                          {leg.type === 'call' ? 'CALL' : 'PUT'}
                        </Text>
                      </View>
                      <Text style={styles.legStrike}>${leg.strike}</Text>
                    </View>
                    
                    <View style={styles.legDetails}>
                      <View style={styles.legDetailRow}>
                        <Text style={styles.legDetailLabel}>Price:</Text>
                        <Text style={styles.legDetailValue}>${leg.lastPrice}</Text>
                      </View>
                      <View style={styles.legDetailRow}>
                        <Text style={styles.legDetailLabel}>Volume:</Text>
                        <Text style={styles.legDetailValue}>{leg.volume.toLocaleString()}</Text>
                      </View>
                      <View style={styles.legDetailRow}>
                        <Text style={styles.legDetailLabel}>IV:</Text>
                        <Text style={styles.legDetailValue}>
                          {formatPercent(leg.impliedVolatility * 100, 1)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
            
            <View style={styles.modalSection}>
              <Text style={styles.sectionTitle}>When to Use</Text>
              <View style={styles.useCaseContainer}>
                <View style={styles.useCase}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.BULLISH} />
                  <Text style={styles.useCaseText}>
                    {probability >= 70 ? 'High conviction trades' :
                     probability >= 50 ? 'Moderate market moves' :
                     'Speculative plays'}
                  </Text>
                </View>
                <View style={styles.useCase}>
                  <Ionicons name="time" size={20} color={COLORS.WARNING} />
                  <Text style={styles.useCaseText}>
                    Best used when you have a clear market outlook
                  </Text>
                </View>
                <View style={styles.useCase}>
                  <Ionicons name="alert-circle" size={20} color={COLORS.ERROR} />
                  <Text style={styles.useCaseText}>
                    Monitor positions regularly for adjustments
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
          
          <View style={styles.modalFooter}>
            <TouchableOpacity 
              style={[styles.modalButton, styles.closeButton]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.modalButton, styles.analyzeButton]}
              onPress={() => {
                setModalVisible(false);
                if (onSelect) onSelect(strategy);
              }}
            >
              <Text style={styles.analyzeButtonText}>Analyze Further</Text>
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

const StrategyList = ({ 
  strategies = [], 
  onSelectStrategy,
  title = 'Suggested Strategies',
  emptyMessage = 'No strategies found'
}) => {
  if (strategies.length === 0) {
    return (
      <View style={styles.emptyList}>
        <Ionicons name="bulb-outline" size={48} color={COLORS.TEXT_SECONDARY} />
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }
  
  return (
    <View style={styles.listContainer}>
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listCount}>{strategies.length} found</Text>
      </View>
      
      {strategies.map((strategy, index) => (
        <StrategyCard
          key={index}
          strategy={strategy}
          onSelect={onSelectStrategy}
          compact={true}
          showDetails={true}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  // Compact View Styles
  compactCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  compactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  compactTitleContainer: {
    flex: 1
  },
  compactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 2
  },
  compactType: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY
  },
  compactStats: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  compactStat: {
    alignItems: 'center'
  },
  compactStatLabel: {
    fontSize: 10,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 2
  },
  compactStatValue: {
    fontSize: 14,
    fontWeight: '600'
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
    alignItems: 'center',
    flex: 1
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 2
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY
  },
  probabilityBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  probabilityText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY
  },
  probabilityLabel: {
    fontSize: 10,
    color: COLORS.TEXT_SECONDARY
  },
  description: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    lineHeight: 20,
    marginBottom: 16
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  stat: {
    alignItems: 'center'
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 4
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600'
  },
  legsContainer: {
    marginBottom: 16
  },
  legsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 8
  },
  legBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8
  },
  legText: {
    fontSize: 12,
    color: COLORS.TEXT_PRIMARY,
    fontWeight: '500'
  },
  moreLegsBadge: {
    backgroundColor: COLORS.INFO,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  moreLegsText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600'
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    paddingTop: 12
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  detailsButtonText: {
    color: COLORS.INFO,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4
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
    maxHeight: '90%'
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 2
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionButton: {
    padding: 8,
    marginLeft: 8
  },
  modalBody: {
    padding: 20
  },
  modalSection: {
    marginBottom: 24
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 16
  },
  modalDescription: {
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
    lineHeight: 24
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8
  },
  metric: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16
  },
  metricLabel: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 4
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2
  },
  metricHint: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY
  },
  breakevenContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  breakevenPoint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(33, 150, 243, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  breakevenText: {
    color: COLORS.INFO,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8
  },
  greeksContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  greekItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80
  },
  greekLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 2
  },
  greekValue: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY
  },
  legsCount: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: 12
  },
  legDetail: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8
  },
  legHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  legTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 8
  },
  legTypeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold'
  },
  legStrike: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY
  },
  legDetails: {
    marginLeft: 4
  },
  legDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  legDetailLabel: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY
  },
  legDetailValue: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.TEXT_PRIMARY
  },
  useCaseContainer: {
    gap: 12
  },
  useCase: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  useCaseText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.TEXT_PRIMARY,
    marginLeft: 12,
    lineHeight: 20
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
    gap: 12
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center'
  },
  closeButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.TEXT_SECONDARY
  },
  closeButtonText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 16,
    fontWeight: '600'
  },
  analyzeButton: {
    backgroundColor: COLORS.INFO
  },
  analyzeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  },
  
  // List Styles
  listContainer: {
    marginVertical: 16
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4
  },
  listTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY
  },
  listCount: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY
  },
  emptyList: {
    padding: 40,
    alignItems: 'center',
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12
  },
  emptyText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center'
  }
});

export { StrategyCard, StrategyList };
export default StrategyCard;
