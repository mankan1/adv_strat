const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');
require('dotenv').config();
const socketIo = require('socket.io');
const http = require('http');
const winston = require('winston');
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Import routes
const apiRoutes = require('./routes/api');

// Initialize Express
const app = express();
const server = http.createServer(app);

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Rate limiting
const rateLimiter = new RateLimiterMemory({
  points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  duration: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000 // 15 minutes
});

// Apply rate limiting middleware
app.use((req, res, next) => {
  rateLimiter.consume(req.ip)
    .then(() => next())
    .catch(() => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({ 
        success: false, 
        error: 'Too many requests. Please try again later.' 
      });
    });
});

// Middleware
app.use(helmet());
app.use(compression());
//app.use(cors({
  //origin: process.env.CORS_ORIGIN?.split(',') || [
    //'http://localhost:19006',
    //'http://localhost:3000',
    //'http://localhost:5000',
    //'http://localhost:8080'
  //],
  //credentials: true
//}));

app.use(cors({
  origin: 'http://localhost:8081', // Your frontend URL
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });
  next();
});

// Initialize WebSocket
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ["http://localhost:19006"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Options Analysis API',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Database Connection
const connectDB = async () => {
  if (process.env.MONGODB_URI && process.env.MONGODB_URI !== 'mongodb://localhost:27017/options_analysis') {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000
      });
      logger.info('✅ MongoDB connected successfully');
    } catch (error) {
      logger.error('MongoDB connection error:', error);
      logger.warn('⚠️ Continuing without database - using in-memory storage');
    }
  } else {
    logger.info('⚠️ MongoDB not configured - using in-memory storage');
  }
};

// Connect to database
connectDB();

// API Routes
app.use('/', apiRoutes);

// WebSocket event handlers
io.on('connection', (socket) => {
  logger.info(`🔌 WebSocket client connected: ${socket.id}`);
  
  socket.on('subscribe', (data) => {
    const { symbol, type = 'scans' } = data;
    const room = `${type}-${symbol}`;
    socket.join(room);
    logger.info(`Client ${socket.id} subscribed to ${room}`);
    
    // Send initial data
    socket.emit('subscribed', {
      room,
      symbol,
      message: `Subscribed to ${symbol} ${type}`
    });
  });
  
  socket.on('unsubscribe', (data) => {
    const { symbol, type = 'scans' } = data;
    const room = `${type}-${symbol}`;
    socket.leave(room);
    logger.info(`Client ${socket.id} unsubscribed from ${room}`);
  });
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io accessible to routes
app.set('socketio', io);
app.set('logger', logger);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.url
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Server error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });
  
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
    
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  logger.info(`🚀 Server started on http://${HOST}:${PORT}`);
  logger.info(`📊 Health check: http://${HOST}:${PORT}/health`);
  logger.info(`🔍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`📡 Tradier API: ${process.env.TRADIER_SANDBOX === 'true' ? 'SANDBOX' : 'PRODUCTION'}`);
  
  if (process.env.TRADIER_API_KEY === 'your_tradier_api_key_here') {
    logger.warn('⚠️ WARNING: Using demo mode. Set TRADIER_API_KEY in .env for real data.');
  }
});
