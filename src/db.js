const mysql = require('mysql2/promise');

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

// Database connection
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

function getPool() {
  return pool;
}

module.exports = {
  createDatabaseConnection,
  getPool
};
