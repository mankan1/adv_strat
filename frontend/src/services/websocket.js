import io from 'socket.io-client';
import { SOCKET_URL } from '../config/constants';
import Toast from 'react-native-toast-message';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.listeners = new Map();
    this.reconnectDelay = 1000;
  }

  connect() {
    if (this.socket && this.socket.connected) {
      console.log('✅ WebSocket already connected');
      return;
    }

    console.log(`🔌 Connecting to WebSocket at ${SOCKET_URL}`);
    
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      timeout: 10000
    });

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ WebSocket connected successfully');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      Toast.show({
        type: 'success',
        text1: 'Connected',
        text2: 'Real-time updates enabled',
        position: 'bottom',
        visibilityTime: 3000
      });

      // Re-register listeners
      this.listeners.forEach((callback, event) => {
        this.socket.on(event, callback);
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ WebSocket disconnected:', reason);
      this.isConnected = false;
      
      if (reason === 'io server disconnect') {
        // Server initiated disconnect, try to reconnect
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error.message);
      this.isConnected = false;
      this.reconnectAttempts++;
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        Toast.show({
          type: 'error',
          text1: 'Connection Failed',
          text2: 'Unable to connect to real-time server',
          position: 'bottom',
          visibilityTime: 5000
        });
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`♻️ WebSocket reconnected after ${attemptNumber} attempts`);
      this.isConnected = true;
      
      Toast.show({
        type: 'info',
        text1: 'Reconnected',
        text2: 'Real-time updates restored',
        position: 'bottom',
        visibilityTime: 3000
      });
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`🔄 Reconnection attempt ${attemptNumber}`);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❌ WebSocket reconnection failed');
      Toast.show({
        type: 'error',
        text1: 'Connection Lost',
        text2: 'Unable to restore real-time connection',
        position: 'bottom',
        visibilityTime: 5000
      });
    });

    // Application-specific events
    this.socket.on('scan-update', (data) => {
      console.log('📡 Real-time scan update:', data.symbol);
      this.emit('scan-update', data);
    });

    this.socket.on('new-scan', (data) => {
      console.log('🆕 New scan completed:', data.symbol);
      this.emit('new-scan', data);
    });

    this.socket.on('market-update', (data) => {
      console.log('📈 Market update:', data.symbol);
      this.emit('market-update', data);
    });

    this.socket.on('sentiment-update', (data) => {
      console.log('🎭 Market sentiment update:', data);
      this.emit('sentiment-update', data);
    });
  }

  subscribe(symbol, type = 'scans') {
    if (!this.isConnected || !this.socket) {
      console.warn('⚠️ Cannot subscribe: WebSocket not connected');
      return false;
    }

    console.log(`📥 Subscribing to ${symbol} ${type}`);
    this.socket.emit('subscribe', { symbol, type });
    return true;
  }

  unsubscribe(symbol, type = 'scans') {
    if (!this.isConnected || !this.socket) {
      console.warn('⚠️ Cannot unsubscribe: WebSocket not connected');
      return false;
    }

    console.log(`📤 Unsubscribing from ${symbol} ${type}`);
    this.socket.emit('unsubscribe', { symbol, type });
    return true;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, callback);
      
      if (this.socket) {
        this.socket.on(event, callback);
      }
    }
  }

  off(event) {
    if (this.listeners.has(event)) {
      this.listeners.delete(event);
      
      if (this.socket) {
        this.socket.off(event);
      }
    }
  }

  emit(event, data) {
    // Internal event emitter for local listeners
    const listeners = this.listeners.get(event);
    if (listeners) {
      if (typeof listeners === 'function') {
        listeners(data);
      }
    }
  }

  disconnect() {
    if (this.socket) {
      console.log('🔌 Disconnecting WebSocket');
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.listeners.clear();
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts
    };
  }

  // Send custom message
  send(event, data) {
    if (!this.isConnected || !this.socket) {
      console.warn('⚠️ Cannot send message: WebSocket not connected');
      return false;
    }

    console.log(`📤 Sending ${event}:`, data);
    this.socket.emit(event, data);
    return true;
  }
}

// Create singleton instance
const webSocketService = new WebSocketService();

export default webSocketService;
