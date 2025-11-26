const express = require('express');
const session = require('express-session');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import modules
const { createDatabaseConnection, getPool } = require('./src/db');
const { configureTemplateEngine } = require('./src/middleware');
const { setupSocketHandlers } = require('./src/socket');
const { startBackgroundTasks } = require('./src/background');
const { tryCreateMatch } = require('./src/matchmaking');

// Import route modules
const createAuthRoutes = require('./src/routes/auth');
const createMatchmakingRoutes = require('./src/routes/matchmaking');
const createApiRoutes = require('./src/routes/api');

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT;

// Configure Nunjucks template engine
configureTemplateEngine(app);

// Middleware
app.set('trust proxy', true);
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 1000,
  max: 100
});
app.use(limiter);

// Setup routes
let pool = null;

async function setupRoutes() {
  pool = getPool();
  
  // Mount route modules
  app.use('/', createAuthRoutes(pool));
  app.use('/', createMatchmakingRoutes(pool));
  app.use('/', createApiRoutes(pool, io));
  
  // Error handling middleware
  app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    res.status(500).send('Internal server error');
  });

  // 404 handler
  app.use((req, res) => {
    console.log(`❌ 404: ${req.method} ${req.url}`);
    if (req.session.user) {
      res.redirect('/lobby');
    } else {
      res.redirect('/auth');
    }
  });
}

// Start server
async function startServer() {
  try {
    console.log('🚀 Starting Whereami Duel server...');
    
    const connected = await createDatabaseConnection();
    if (!connected) {
      console.error('❌ Could not connect to database.');
      process.exit(1);
    }
    
    pool = getPool();
    
    // Setup routes after database connection
    await setupRoutes();
    
    // Setup Socket.IO handlers
    setupSocketHandlers(io, pool);
    
    // Start background tasks
    startBackgroundTasks(io, pool);
    
    server.listen(PORT, () => {
      console.log(`\n🎮 Whereami Duel is ready!`);
      console.log(`🌐 Server running at: http://localhost:${PORT}`);
      console.log(`✅ Root route: http://localhost:${PORT}/`);
      console.log(`✅ Auth page: http://localhost:${PORT}/auth`);
      console.log(`✅ Lobby: http://localhost:${PORT}/lobby`);
      console.log(`✅ Leaderboard: http://localhost:${PORT}/leaderboard`);
      
      // Test database connection
      console.log('🔍 Testing database connection...');
      pool.getConnection()
        .then(connection => {
          console.log('✅ Database connection test successful');
          connection.release();
        })
        .catch(error => {
          console.error('❌ Database connection test failed:', error);
        });
    });
    
    // Start matchmaking loop
    matchmakingLoop();
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Matchmaking loop
async function matchmakingLoop() {
  while (true) {
    try {
      await tryCreateMatch(pool);
    } catch (e) {
      console.error("Error in matchmaking loop:", e);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();
