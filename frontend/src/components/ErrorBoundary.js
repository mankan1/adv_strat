import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView
} from 'react-native';
import { COLORS } from '../config/constants';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // Log error to console
    console.error('Error Boundary caught an error:', error, errorInfo);
    
    // Here you could also log to an error reporting service
    // logErrorToService(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
    
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorTitle}>Something went wrong</Text>
            <Text style={styles.errorMessage}>
              The application encountered an unexpected error.
            </Text>
            
            {this.props.showDetails && this.state.error && (
              <ScrollView style={styles.detailsContainer}>
                <Text style={styles.detailsTitle}>Error Details:</Text>
                <Text style={styles.detailsText}>
                  {this.state.error.toString()}
                </Text>
                
                {this.state.errorInfo && (
                  <>
                    <Text style={styles.detailsTitle}>Component Stack:</Text>
                    <Text style={styles.detailsText}>
                      {this.state.errorInfo.componentStack}
                    </Text>
                  </>
                )}
              </ScrollView>
            )}
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity 
                style={styles.retryButton}
                onPress={this.handleRetry}
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
              
              {this.props.onClose && (
                <TouchableOpacity 
                  style={styles.closeButton}
                  onPress={this.props.onClose}
                >
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <Text style={styles.helpText}>
              If the problem persists, please restart the app.
            </Text>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const ErrorMessage = ({ 
  message, 
  onRetry, 
  showRetry = true,
  type = 'error' 
}) => {
  const getTypeStyles = () => {
    switch (type) {
      case 'warning':
        return {
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          borderColor: COLORS.WARNING,
          icon: '⚠️'
        };
      case 'info':
        return {
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          borderColor: COLORS.INFO,
          icon: 'ℹ️'
        };
      case 'success':
        return {
          backgroundColor: 'rgba(76, 175, 80, 0.1)',
          borderColor: COLORS.SUCCESS,
          icon: '✅'
        };
      default:
        return {
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          borderColor: COLORS.ERROR,
          icon: '❌'
        };
    }
  };

  const typeStyles = getTypeStyles();

  return (
    <View style={[styles.messageContainer, typeStyles]}>
      <Text style={styles.messageIcon}>{typeStyles.icon}</Text>
      <View style={styles.messageContent}>
        <Text style={styles.messageText}>{message}</Text>
        {showRetry && onRetry && (
          <TouchableOpacity 
            style={styles.messageButton}
            onPress={onRetry}
          >
            <Text style={styles.messageButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const NetworkError = ({ onRetry, message = 'Network connection error' }) => {
  return (
    <View style={styles.networkErrorContainer}>
      <Text style={styles.networkErrorIcon}>📡</Text>
      <Text style={styles.networkErrorTitle}>Connection Lost</Text>
      <Text style={styles.networkErrorMessage}>{message}</Text>
      <Text style={styles.networkErrorHint}>
        Please check your internet connection and try again.
      </Text>
      {onRetry && (
        <TouchableOpacity 
          style={styles.networkErrorButton}
          onPress={onRetry}
        >
          <Text style={styles.networkErrorButtonText}>Reconnect</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const NoDataMessage = ({ 
  message = 'No data available', 
  icon = '📊',
  showRefresh = true,
  onRefresh 
}) => {
  return (
    <View style={styles.noDataContainer}>
      <Text style={styles.noDataIcon}>{icon}</Text>
      <Text style={styles.noDataText}>{message}</Text>
      {showRefresh && onRefresh && (
        <TouchableOpacity 
          style={styles.noDataButton}
          onPress={onRefresh}
        >
          <Text style={styles.noDataButtonText}>Refresh</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND,
    padding: 20
  },
  errorContainer: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    maxWidth: 400
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 8,
    textAlign: 'center'
  },
  errorMessage: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 24
  },
  detailsContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    maxHeight: 200
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 4
  },
  detailsText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    fontFamily: 'monospace'
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12
  },
  retryButton: {
    backgroundColor: COLORS.INFO,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  closeButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.TEXT_SECONDARY,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120
  },
  closeButtonText: {
    color: COLORS.TEXT_SECONDARY,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center'
  },
  helpText: {
    fontSize: 12,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 20,
    textAlign: 'center'
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8
  },
  messageIcon: {
    fontSize: 20,
    marginRight: 12
  },
  messageContent: {
    flex: 1
  },
  messageText: {
    fontSize: 14,
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 8
  },
  messageButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4
  },
  messageButtonText: {
    fontSize: 12,
    color: COLORS.TEXT_PRIMARY,
    fontWeight: '500'
  },
  networkErrorContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    margin: 20
  },
  networkErrorIcon: {
    fontSize: 48,
    marginBottom: 16
  },
  networkErrorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.TEXT_PRIMARY,
    marginBottom: 8
  },
  networkErrorMessage: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 8
  },
  networkErrorHint: {
    fontSize: 14,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 24
  },
  networkErrorButton: {
    backgroundColor: COLORS.INFO,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8
  },
  networkErrorButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  },
  noDataContainer: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: 12,
    margin: 20
  },
  noDataIcon: {
    fontSize: 48,
    marginBottom: 16
  },
  noDataText: {
    fontSize: 18,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: 24
  },
  noDataButton: {
    backgroundColor: COLORS.INFO,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8
  },
  noDataButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  }
});

export { ErrorBoundary, ErrorMessage, NetworkError, NoDataMessage };
export default ErrorBoundary;
