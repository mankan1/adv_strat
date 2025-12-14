import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing
} from 'react-native';
import { COLORS } from '../config/constants';

const LoadingSpinner = ({ 
  size = 'large', 
  color = COLORS.INFO,
  text = 'Loading...',
  fullScreen = false,
  showText = true 
}) => {
  const spinValue = new Animated.Value(0);

  React.useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true
      })
    );
    
    spinAnimation.start();
    
    return () => spinAnimation.stop();
  }, [spinValue]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const Container = fullScreen ? View : React.Fragment;
  const containerStyle = fullScreen ? styles.fullScreenContainer : {};

  return (
    <Container style={containerStyle}>
      <View style={styles.container}>
        <Animated.View style={[styles.spinnerContainer, { transform: [{ rotate: spin }] }]}>
          <ActivityIndicator size={size} color={color} />
        </Animated.View>
        
        {showText && (
          <Text style={styles.text}>
            {text}
          </Text>
        )}
      </View>
    </Container>
  );
};

const LoadingOverlay = ({ visible = true, message = 'Processing...' }) => {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.overlayContent}>
        <ActivityIndicator size="large" color={COLORS.INFO} />
        <Text style={styles.overlayText}>{message}</Text>
      </View>
    </View>
  );
};

const SkeletonLoader = ({ type = 'card', count = 1 }) => {
  const SkeletonCard = () => (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonHeader} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLine} />
      <View style={styles.skeletonLine} />
    </View>
  );

  const SkeletonList = () => (
    <View style={styles.skeletonList}>
      {[...Array(count)].map((_, index) => (
        <View key={index} style={styles.skeletonListItem}>
          <View style={styles.skeletonCircle} />
          <View style={styles.skeletonTextContainer}>
            <View style={styles.skeletonTextLine} />
            <View style={[styles.skeletonTextLine, { width: '60%' }]} />
          </View>
        </View>
      ))}
    </View>
  );

  switch (type) {
    case 'card':
      return <SkeletonCard />;
    case 'list':
      return <SkeletonList />;
    default:
      return <SkeletonCard />;
  }
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  fullScreenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND
  },
  spinnerContainer: {
    marginBottom: 16
  },
  text: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 8
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000
  },
  overlayContent: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 200
  },
  overlayText: {
    fontSize: 16,
    color: COLORS.TEXT_PRIMARY,
    marginTop: 16,
    textAlign: 'center'
  },
  skeletonCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12
  },
  skeletonHeader: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    height: 24,
    width: '60%',
    borderRadius: 4,
    marginBottom: 16
  },
  skeletonLine: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    height: 12,
    borderRadius: 4,
    marginBottom: 8
  },
  skeletonList: {
    padding: 16
  },
  skeletonListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)'
  },
  skeletonCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginRight: 12
  },
  skeletonTextContainer: {
    flex: 1
  },
  skeletonTextLine: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    height: 12,
    borderRadius: 4,
    marginBottom: 6
  }
});

export { LoadingSpinner, LoadingOverlay, SkeletonLoader };
export default LoadingSpinner;
