import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, CHART_COLORS } from '../config/constants';
import { formatCurrency, formatPercent, getColorForValue } from '../utils/formatters';

const MarketIndicator = ({ 
  symbol, 
  price, 
  change, 
  changePercent, 
  volume,
  showDetails = false,
  onPress,
  size = 'medium',
  showTrend = true
}) => {
  const [animatedValue] = useState(new Animated.Value(0));
  const [previousPrice, setPreviousPrice] = useState(price);
  const [flashColor, setFlashColor] = useState(null);

  useEffect(() => {
    if (price !== previousPrice) {
      const isUp = price > previousPrice;
      setFlashColor(isUp ? COLORS.BULLISH : COLORS.BEARISH);
      
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
          delay: 300
        })
      ]).start();
      
      setPreviousPrice(price);
      
      // Reset flash color after animation
      setTimeout(() => setFlashColor(null), 1000);
    }
  }, [price, previousPrice]);

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [
      COLORS.CARD_BACKGROUND,
      flashColor || COLORS.CARD_BACKGROUND
    ]
  });

  const getSizeStyles = () => {
    switch (size) {
      case 'small':
        return {
          padding: 8,
          symbolSize: 14,
          priceSize: 16,
          changeSize: 12
        };
      case 'large':
        return {
          padding: 16,
          symbolSize: 20,
          priceSize: 24,
          changeSize: 16
        };
      default:
        return {
          padding: 12,
          symbolSize: 16,
          priceSize: 20,
          changeSize: 14
        };
    }
  };

  const sizeStyles = getSizeStyles();
  const changeColor = getColorForValue(change, 'change');
  const trendIcon = change > 0 ? 'trending-up' : change < 0 ? 'trending-down' : 'trending-flat';

  const renderIndicator = () => (
    <Animated.View style={[
      styles.indicator,
      { 
        backgroundColor,
        padding: sizeStyles.padding 
      }
    ]}>
      <View style={styles.indicatorHeader}>
        <Text style={[
          styles.symbol,
          { fontSize: sizeStyles.symbolSize }
        ]}>
          {symbol}
        </Text>
        
        {showTrend && change !== 0 && (
          <Ionicons 
            name={trendIcon} 
            size={sizeStyles.changeSize} 
            color={changeColor} 
            style={styles.trendIcon}
          />
        )}
      </View>
      
      <Text style={[
        styles.price,
        { fontSize: sizeStyles.priceSize }
      ]}>
        {formatCurrency(price)}
      </Text>
      
      <View style={styles.changeRow}>
        <Text style={[
          styles.change,
          { color: changeColor, fontSize: sizeStyles.changeSize }
        ]}>
          {change > 0 ? '+' : ''}{formatCurrency(change)}
        </Text>
        <Text style={[
          styles.changePercent,
          { color: changeColor, fontSize: sizeStyles.changeSize }
        ]}>
          ({formatPercent(changePercent)})
        </Text>
      </View>
      
      {volume && (
        <Text style={styles.volume}>
          Vol: {formatCurrency(volume, 0)}
        </Text>
      )}
    </Animated.View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={() => onPress(symbol)}>
        {renderIndicator()}
      </TouchableOpacity>
    );
  }

  return renderIndicator();
};

const MarketOverview = ({ data = {}, onSymbolPress }) => {
  const [expanded, setExpanded] = useState(false);

  const indices = [
    { symbol: 'SPX', label: 'S&P 500', ...(data['SPX'] || {}) },
    { symbol: 'NDX', label: 'NASDAQ', ...(data['NDX'] || {}) },
    { symbol: 'DJI', label: 'Dow Jones', ...(data['DJI'] || {}) },
    { symbol: 'RUT', label: 'Russell 2000', ...(data['RUT'] || {}) },
    { symbol: 'VIX', label: 'VIX', ...(data['VIX'] || {}) }
  ];

  const visibleIndices = expanded ? indices : indices.slice(0, 3);

  return (
    <View style={styles.overviewContainer}>
      <View style={styles.overviewHeader}>
        <Text style={styles.overviewTitle}>Market Overview</Text>
        <TouchableOpacity onPress={() => setExpanded(!expanded)}>
          <Text style={styles.expandButton}>
            {expanded ? 'Show Less' : 'Show More'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.overviewScroll}
      >
        {visibleIndices.map((index, idx) => (
          <MarketIndicator
            key={idx}
            symbol={index.symbol}
            price={index.price || 0}
            change={index.change || 0}
            changePercent={index.changePercent || 0}
            onPress={onSymbolPress}
            size="medium"
            showTrend={true}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const SentimentIndicator = ({ sentiment = 'NEUTRAL' }) => {
  const sentimentConfig = {
    'STRONGLY_BULLISH': { 
      color: COLORS.BULLISH, 
      icon: 'trending-up', 
      label: 'Strongly Bullish',
      intensity: 1.0
    },
    'BULLISH': { 
      color: '#8BC34A', 
      icon: 'trending-up', 
      label: 'Bullish',
      intensity: 0.7
    },
    'NEUTRAL': { 
      color: COLORS.NEUTRAL, 
      icon: 'trending-flat', 
      label: 'Neutral',
      intensity: 0.5
    },
    'BEARISH': { 
      color: '#FF5722', 
      icon: 'trending-down', 
      label: 'Bearish',
      intensity: 0.3
    },
    'STRONGLY_BEARISH': { 
      color: COLORS.BEARISH, 
      icon: 'trending-down', 
      label: 'Strongly Bearish',
      intensity: 0.0
    }
  };

  const config = sentimentConfig[sentiment] || sentimentConfig.NEUTRAL;

  return (
    <View style={styles.sentimentContainer}>
      <View style={styles.sentimentLabelRow}>
        <Ionicons name={config.icon} size={20} color={config.color} />
        <Text style={styles.sentimentLabel}>{config.label}</Text>
      </View>
      
      <View style={styles.sentimentBar}>
        <View 
          style={[
            styles.sentimentFill,
            { 
              backgroundColor: config.color,
              width: `${config.intensity * 100}%`
            }
          ]} 
        />
      </View>
    </View>
  );
};

const VolumeIndicator = ({ volume, averageVolume, symbol }) => {
  const volumeRatio = averageVolume > 0 ? volume / averageVolume : 1;
  const isHighVolume = volumeRatio > 1.5;
  const isLowVolume = volumeRatio < 0.5;

  let volumeStatus = 'Normal';
  let statusColor = COLORS.NEUTRAL;

  if (isHighVolume) {
    volumeStatus = 'High';
    statusColor = COLORS.BULLISH;
  } else if (isLowVolume) {
    volumeStatus = 'Low';
    statusColor = COLORS.BEARISH;
  }

  return (
    <View style={styles.volumeContainer}>
      <Text style={styles.volumeTitle}>Volume: {volumeStatus}</Text>
      
      <View style={styles.volumeBarContainer}>
        <View style={styles.volumeBarBackground}>
          <View 
            style={[
              styles.volumeBarFill,
              { 
                width: `${Math.min(volumeRatio * 50, 100)}%`,
                backgroundColor: statusColor
              }
            ]} 
          />
        </View>
        
        <Text style={styles.volumeRatio}>
          {volumeRatio.toFixed(1)}x avg
        </Text>
      </View>
      
      <Text style={styles.volumeDetails}>
        {formatCurrency(volume, 0)} vs {formatCurrency(averageVolume, 0)} avg
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  indicator: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    marginHorizontal: 8,
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  indicatorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  symbol: {
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY
  },
  trendIcon: {
    marginLeft: 4
  },
  price: {
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  change: {
    fontWeight: '600',
    marginRight: 4
  },
  changePercent: {
    fontWeight: '500'
  },
  volume: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY
  },
  overviewContainer: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 16,
    padding: 16,
    marginVertical: 12
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY
  },
  expandButton: {
    color: COLORS.INFO,
    fontSize: 14,
    fontWeight: '600'
  },
  overviewScroll: {
    paddingVertical: 4
  },
  sentimentContainer: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8
  },
  sentimentLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  sentimentLabel: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8
  },
  sentimentBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden'
  },
  sentimentFill: {
    height: '100%',
    borderRadius: 3
  },
  volumeContainer: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    padding: 12,
    marginVertical: 8
  },
  volumeTitle: {
    color: COLORS.TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8
  },
  volumeBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  volumeBarBackground: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 12
  },
  volumeBarFill: {
    height: '100%',
    borderRadius: 4
  },
  volumeRatio: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 12,
    fontWeight: '600',
    minWidth: 60
  },
  volumeDetails: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 12
  }
});

export { MarketIndicator, MarketOverview, SentimentIndicator, VolumeIndicator };
export default MarketIndicator;
