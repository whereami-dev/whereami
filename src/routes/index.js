/**
 * Central router module that imports all route files
 * This helps organize routes without extracting all of them into separate files
 */

const { setupAuthRoutes } = require('./auth');
const { setupMatchmakingRoutes } = require('./matchmaking');
const { requireAuth } = require('../middleware/auth');

/**
 * Setup all application routes
 * @param {Express} app - Express application
 * @param {Pool} pool - Database connection pool
 * @param {object} dependencies - Additional dependencies (io, etc.)
 */
function setupRoutes(app, pool, dependencies = {}) {
  const { io } = dependencies;
  
  // Setup modular routes
  app.use('/', setupAuthRoutes(pool));
  app.use('/', requireAuth, setupMatchmakingRoutes(pool));
  
  // Import and setup duel routes (kept in main server file for now due to complexity)
  // Import and setup profile routes
  // Import and setup leaderboard routes
  // Import and setup API routes
}

module.exports = { setupRoutes };
