const mysql = require('mysql2/promise');
const { getColorByRating } = require('../utils/helpers');

// Database configurations
const dbConfigs = [
  {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  }
];

let pool = null;

/**
 * Create database connection
 * @returns {Promise<boolean>} Success status
 */
async function createDatabaseConnection() {
  for (let i = 0; i < dbConfigs.length; i++) {
    try {
      console.log(`🔍 Trying database connection method ${i + 1}...`);
      
      const testPool = mysql.createPool(dbConfigs[i]);
      const connection = await testPool.getConnection();
      await connection.ping();
      connection.release();
      
      console.log(`✅ Database connected successfully with method ${i + 1}!`);
      pool = testPool;
      return true;
    } catch (error) {
      console.log(`❌ Method ${i + 1} failed:`, error.message);
      continue;
    }
  }
  return false;
}

/**
 * Get the database pool
 * @returns {Pool} MySQL connection pool
 */
function getPool() {
  return pool;
}

/**
 * Helper function to get user color based on ELO rating
 * @param {string} uid - User ID
 * @returns {Promise<string|null>} Color class or null
 */
async function getUserColor(uid) {
  if (!uid) return null;
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT elo_rating FROM users WHERE uid = ?',
      [uid]
    );
    connection.release();
    return rows.length > 0 ? getColorByRating(rows[0].elo_rating) : null;
  } catch (error) {
    console.error('Failed to get user color:', error);
    return null;
  }
}

module.exports = {
  createDatabaseConnection,
  getPool,
  getUserColor
};
