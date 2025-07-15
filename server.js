const express = require('express');
const mysql = require('mysql2/promise');
const nunjucks = require('nunjucks');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { createServer } = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
const moment = require('moment-timezone');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT;

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

// 修改距离计算函数，处理 NULL 坐标
function calculateDistance(lat1, lng1, lat2, lng2) {
  // 如果任何一个坐标是 null 或 undefined（表示没有猜测），返回 -1 表示无效距离
  if (lat1 === null || lng1 === null || lat2 === null || lng2 === null ||
      lat1 === undefined || lng1 === undefined || lat2 === undefined || lng2 === undefined) {
    return -1;
  }
  
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 修改得分计算函数，处理无效距离
function calculateScore(distance) {
  // 如果距离是 -1（无效），返回 0 分
  if (distance === -1 || distance === null || distance === undefined) {
    return 0;
  }
  
  const maxDistance = 20037.5; // Half of Earth's circumference
  return Math.round(5000 * Math.exp(-10 * (distance / maxDistance)));
}

// Rating color system
function getColorByRating(str_rating) {
  const rating = parseInt(str_rating);
  if (rating < 1250) return 'grey-rating';
  else if (rating < 1350) return 'green-rating';
  else if (rating < 1450) return 'cyan-rating';
  else if (rating < 1550) return 'blue-rating';
  else if (rating < 1650) return 'yellow-rating';
  else if (rating < 1750) return 'orange-rating';
  else if (rating < 1850) return 'red-rating';
  else if (rating < 1950) return 'nutella';
  else if (rating < 2050) return 'tourist';
  else return 'rainbow';
}

// Helper function to get user color
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

// Configure Nunjucks
app.set('view engine', 'njk');
const nunjucksEnv = nunjucks.configure('views', {
  autoescape: true,
  express: app,
  watch: true
});

// Add custom filters
nunjucksEnv.addFilter('round', function(num, digits) {
  if (num === null || num === undefined) return 'N/A';
  return parseFloat(num).toFixed(digits || 2);
});

nunjucksEnv.addFilter('abs', function(num) {
  return Math.abs(num);
});

nunjucksEnv.addFilter('format', function(num, format) {
  if (num === null || num === undefined) return 'N/A';
  if (format && format.includes('.4f')) {
    return parseFloat(num).toFixed(4);
  } else if (format && format.includes('.2f')) {
    return parseFloat(num).toFixed(2);
  }
  return num.toString();
});

// Middleware
app.set('trust proxy', true);
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.locals.moment = moment;
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

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/auth');
  }
  if (req.session.user.userType === 'Banned') {
    req.session.destroy();
    return res.redirect('/auth?error=banned');
  }
  next();
}

// Helper functions
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function generateValidStreetViewLocation() {
  const maxAttempts = 50; // 增加了最大尝试次数以应对重选逻辑
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n--- [Attempt ${attempts}] ---`);

    try {
      // 1. 生成随机坐标
      const lat = Math.random() * 180 - 90;
      const lng = Math.random() * 360 - 180;
      if (lat < -80) {
        // Avoid incorrect street views
        continue;
      }

      // 2. 使用 Street View Metadata API 验证位置有效性
      let streetViewUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=50000&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      
      if (Math.random() < 0.75) { // 75% probability for outdoor street views
        streetViewUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&radius=50000&source=outdoor&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      }

      const svResponse = await axios.get(streetViewUrl);
      // 如果没有找到街景，则继续下一次循环
      if (svResponse.data.status !== 'OK') {
        console.log(`❌ No street view at: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
        continue; // 跳过当前循环的剩余部分
      }
      const location = svResponse.data.location;
      const streetViewUrl2 = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${location.lat},${location.lng}&radius=1&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      const svResponse2 = await axios.get(streetViewUrl2);
      if (svResponse2.data.status !== 'OK') {
        // Use fallback location
        return {
          lat: 39.0194608,
          lng: 125.75355107
        };
      }
      
      console.log(`✅ Valid street view panorama found at: ${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`);

      // 3. 【新增】使用 Geocoding API 获取国家代码
      // 我们使用从街景API修正后的精确坐标
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${location.lat},${location.lng}&key=${process.env.GOOGLE_MAPS_API_KEY}&result_type=country`;
      
      const geoResponse = await axios.get(geocodeUrl);

      let countryCode = null;
      // 检查Geocoding API是否成功返回结果
      if (geoResponse.data.status === 'OK' && geoResponse.data.results.length > 0) {
        // 遍历地址组成部分，找到类型为 'country' 的那一个
        const addressComponents = geoResponse.data.results[0].address_components;
        const countryComponent = addressComponents.find(c => c.types.includes('country'));
        if (countryComponent) {
          countryCode = countryComponent.short_name; // 'short_name' 通常是两位国家代码，如 'US'
        }
      }

      if (!countryCode) {
        console.log(`⚠️ Could not determine country for the location. Skipping.`);
        continue;
      }

      console.log(`🌍 Country identified as: ${countryCode}`);

      // 4. 【新增】根据国家代码执行重选逻辑以维持生成地区平衡
      const randomChance = Math.random(); // 生成一个 0 到 1 之间的随机数
      let shouldReselect = false;

      if ((countryCode === 'US' || countryCode === 'CA') && randomChance < 0.30) {
        console.log(`🎲 Reselecting due to 30% chance for ${countryCode}.`);
        shouldReselect = true;
      } else if (countryCode === 'RU' && randomChance < 0.50) {
        console.log(`🎲 Reselecting due to 50% chance for ${countryCode}.`);
        shouldReselect = true;
      } else if ((countryCode === 'AU' || countryCode === 'BR') && randomChance < 0.20) {
        console.log(`🎲 Reselecting due to 20% chance for ${countryCode}.`);
        shouldReselect = true;
      }

      if (shouldReselect) {
        continue; // 如果需要重选，则跳过，开始新的循环
      }

      // 5. 如果所有检查都通过，返回最终结果
      console.log(`🎉 Success! Selected location in ${countryCode}.`);
      return {
        lat: location.lat,
        lng: location.lng
      };

    } catch (error) {
      // 错误处理，避免因为网络问题等中断整个流程
      // Axios错误会包含 response 对象
      if (error.response) {
        console.error(`Error with API request: ${error.response.status} ${error.response.data.error_message || error.response.statusText}`);
      } else {
        console.error(`An unexpected error occurred:`, error.message);
      }
    }
  }

  // 如果达到最大尝试次数仍然失败，返回一个备用地点
  console.log('⚠️ Reached max attempts. Using fallback location: Pyongyang, North Korea.');
  return {
    lat: 39.0194608,
    lng: 125.75355107
  };
}

class EloRatingSystem {
  /**
   * @param {object} config - 配置对象
   * @param {number} [config.kFactor=32] - K-factor，决定了评分变化的最大幅度。常见值为 16、32 或 64。
   * @param {number} [config.eloDivisor=400] - 在预期得分计算中使用的除数，这是标准值。
   */
  constructor(config = {}) {
    const defaultConfig = {
      kFactor: 64,
      eloDivisor: 400,
    };
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * 计算玩家 A 对阵玩家 B 的预期得分（胜率期望）
   * @param {number} ratingA - 玩家 A 的评分
   * @param {number} ratingB - 玩家 B 的评分
   * @returns {number} 玩家 A 的预期得分 (0 到 1 之间)
   */
  getExpectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / this.config.eloDivisor));
  }

  /**
   * 计算一场比赛后两位玩家的新评分
   * @param {number} player1Rating - 玩家 1 的当前评分
   * @param {number} player2Rating - 玩家 2 的当前评分
   * @param {'win' | 'loss' | 'draw'} player1Result - 玩家 1 的比赛结果
   * @returns {{newRating1: number, newRating2: number, change: number}} 返回包含新评分和变化值的对象
   */
  calculate(player1Rating, player2Rating, player1Result) {
    let score1;

    switch (player1Result) {
      case 'win':
        score1 = 1.0;
        break;
      case 'loss':
        score1 = 0.0;
        break;
      case 'draw':
        score1 = 0.5;
        break;
      default:
        // 如果结果无效，则评分不变
        return {
          newRating1: player1Rating,
          newRating2: player2Rating,
          change1: 0,
		      change2: 0,
        };
    }

    const expectedScore1 = this.getExpectedScore(player1Rating, player2Rating);
    const { kFactor } = this.config;

    // 标准 Elo 核心计算公式
    // K-factor * (实际得分 - 预期得分)
    const ratingChange = kFactor * (score1 - expectedScore1);
    const roundedChange = Math.round(ratingChange);

    // 变化是完全对称的
    const newRating1 = player1Rating + roundedChange;
    const newRating2 = player2Rating - roundedChange;

    return {
      newRating1,
      newRating2,
      change1: roundedChange, // 评分变化值
	    change2: -roundedChange, // 对手的评分变化是相反的
    };
  }
}

// Update ELO ratings
async function updateEloRatings(connection, duelId, player1Uid, player2Uid, result) {
  const ratingSystem = new EloRatingSystem();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  try {
    console.log(`🚀 [${timestamp}] Updating ELO for duel ${duelId}, result: ${result}`);

    const [players] = await connection.execute(
      `SELECT uid, username, elo_rating, peak_elo, elo_games, total_wins, total_losses, total_draws
       FROM users WHERE uid IN (?, ?)`,
      [player1Uid, player2Uid]
    );

    const player1 = players.find(p => p.uid === player1Uid);
    const player2 = players.find(p => p.uid === player2Uid);

    if (!player1 || !player2) {
      console.error(`❌ [${timestamp}] Players not found for ELO update`);
      return;
    }

    const player1OldRating = player1.elo_rating;
    const player2OldRating = player2.elo_rating;

    console.log(`📊 [${timestamp}] Before: ${player1.username}(${player1OldRating}) vs ${player2.username}(${player2OldRating})`);

    // 1. 根據傳入的 result，決定 ELO 計算器需要的 'win', 'loss', 'draw' 字串
    let player1ResultStr, player2ResultStr;
    switch (result) {
      case 'player1_wins':
        player1ResultStr = 'win';
        player2ResultStr = 'loss';
        break;
      case 'player2_wins':
        player1ResultStr = 'loss';
        player2ResultStr = 'win';
        break;
      case 'draw':
        player1ResultStr = 'draw';
        player2ResultStr = 'draw';
        break;
      default:
        console.error(`❌ [${timestamp}] Invalid result: ${result}. No stats updated.`);
        return; // 如果結果無效，直接返回
    }

    // 2. 使用正確的參數 ('win'/'loss'/'draw') 呼叫 ELO 計算函數
    const eloCalculationResult = ratingSystem.calculate(player1OldRating, player2OldRating, player1ResultStr);

    // 3. 從計算結果中獲取新評分和變化值
    //    注意：這裡直接使用返回的屬性名，避免解構失敗
    const player1NewRating = eloCalculationResult.newRating1;
    const player2NewRating = eloCalculationResult.newRating2;
    const player1Change = eloCalculationResult.change1;
    const player2Change = eloCalculationResult.change2;

    console.log(`🔄 [${timestamp}] Changes: ${player1.username} ${player1Change >= 0 ? '+' : ''}${player1Change} (${player1NewRating}), ${player2.username} ${player2Change >= 0 ? '+' : ''}${player2Change} (${player2NewRating})`);

    // Update player statistics
    switch (result) {
      case 'player1_wins':
        player1.total_wins++;
        player2.total_losses++;
        player1ResultStr = 'win';
        player2ResultStr = 'loss';
        break;
      case 'player2_wins':
        player1.total_losses++;
        player2.total_wins++;
        player1ResultStr = 'loss';
        player2ResultStr = 'win';
        break;
      case 'draw':
        player1.total_draws++;
        player2.total_draws++;
        player1ResultStr = 'draw';
        player2ResultStr = 'draw';
        break;
      default:
        console.error(`❌ [${timestamp}] Invalid result: ${result}. No stats updated.`);
        return;
    }
    player1.elo_games++;
    player2.elo_games++;

    // Update database
    await connection.execute(
      `UPDATE users SET
         elo_rating = ?, peak_elo = GREATEST(peak_elo, ?), elo_games = ?,
         total_wins = ?, total_losses = ?, total_draws = ?, total_duels = ?
       WHERE uid = ?`,
      [
        player1NewRating, player1NewRating, player1.elo_games,
        player1.total_wins, player1.total_losses, player1.total_draws,
        player1.elo_games,
        player1Uid
      ]
    );

    await connection.execute(
      `UPDATE users SET
         elo_rating = ?, peak_elo = GREATEST(peak_elo, ?), elo_games = ?,
         total_wins = ?, total_losses = ?, total_draws = ?, total_duels = ?
       WHERE uid = ?`,
      [
        player2NewRating, player2NewRating, player2.elo_games,
        player2.total_wins, player2.total_losses, player2.total_draws,
        player2.elo_games,
        player2Uid
      ]
    );

    await connection.execute(
      `UPDATE duels SET
         player1_elo_before = ?, player2_elo_before = ?,
         player1_elo_after = ?, player2_elo_after = ?,
         elo_change_player1 = ?, elo_change_player2 = ?
       WHERE id = ?`,
      [player1OldRating, player2OldRating, player1NewRating, player2NewRating, player1Change, player2Change, duelId]
    );

    const historyTimestamp = new Date();

    await connection.execute(
      `INSERT INTO elo_history (user_uid, duel_id, old_elo, new_elo, elo_change, opponent_uid, opponent_elo, result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [player1Uid, duelId, player1OldRating, player1NewRating, player1Change, player2Uid, player2OldRating, player1ResultStr, historyTimestamp]
    );

    await connection.execute(
      `INSERT INTO elo_history (user_uid, duel_id, old_elo, new_elo, elo_change, opponent_uid, opponent_elo, result, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [player2Uid, duelId, player2OldRating, player2NewRating, player2Change, player1Uid, player1OldRating, player2ResultStr, historyTimestamp]
    );

    console.log(`✅ [${timestamp}] Duel ${duelId} ELO ratings updated successfully!`);

    return {
      player1: { oldRating: player1OldRating, newRating: player1NewRating, change: player1Change },
      player2: { oldRating: player2OldRating, newRating: player2NewRating, change: player2Change }
    };

  } catch (error) {
    console.error(`❌ [${timestamp}] ELO update error for duel ${duelId}:`, error);
    throw error;
  }
}

// Refactored and Robust `tryCreateMatch`
async function tryCreateMatch() {
  let connection;
  let duelId = null;

  try {
    // ===================================================================
    //  STEP 1: 在单个原子事务中，认领玩家并预创建对决
    // ===================================================================
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [queueUsers] = await connection.execute(
      `SELECT mq.user_uid, u.username, u.elo_rating
       FROM matchmaking_queue mq
       JOIN users u ON mq.user_uid = u.uid
       WHERE mq.created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
       AND u.user_type != "Banned"
       AND NOT EXISTS (
         SELECT 1 FROM duels d 
         WHERE (d.player1_uid = u.uid OR d.player2_uid = u.uid) 
         AND d.status NOT IN ('finished', 'cancelled', 'error')
       )
       ORDER BY mq.created_at ASC
       FOR UPDATE`
    );

    if (queueUsers.length < 2) {
      await connection.commit();
      connection.release();
      return;
    }

    let bestMatch = null;
    let smallestEloDiff = Infinity;
    for (let i = 0; i < queueUsers.length - 1; i++) {
        for (let j = i + 1; j < queueUsers.length; j++) {
            const eloDiff = Math.abs(queueUsers[i].elo_rating - queueUsers[j].elo_rating);
            if (eloDiff < smallestEloDiff) {
                smallestEloDiff = eloDiff;
                bestMatch = [queueUsers[i], queueUsers[j]];
            }
        }
    }
    const [player1, player2] = bestMatch;

    // 从队列中删除
    await connection.execute(
      'DELETE FROM matchmaking_queue WHERE user_uid IN (?, ?)',
      [player1.user_uid, player2.user_uid]
    );

    // **关键：立刻插入一个占位对决**
    duelId = generateUUID();
    await connection.execute(
      `INSERT INTO duels (id, player1_uid, player2_uid, status, player1_elo_before, player2_elo_before) 
       VALUES (?, ?, ?, 'generating', ?, ?)`,
      [duelId, player1.user_uid, player2.user_uid, player1.elo_rating, player2.elo_rating]
    );
    
    // 提交事务，此时玩家已被安全“锁定”在对决中
    await connection.commit();
    connection.release(); // 释放连接
    console.log(`🔒 Players claimed and duel pre-created: ${duelId}`);

    // ===================================================================
    //  STEP 2: 在事务外执行耗时操作
    // ===================================================================
    const locationPromises = Array.from({ length: 5 }, () => generateValidStreetViewLocation());
    const locations = await Promise.all(locationPromises);

    // ===================================================================
    //  STEP 3: 更新对决，使其可玩
    // ===================================================================
    const gameStartTime = new Date(Date.now() + 5000);
    connection = await pool.getConnection(); // 获取新连接
    await connection.execute(
      `UPDATE duels 
       SET status = 'preparing', game_start_at = ?, total_rounds = 5, locations = ?
       WHERE id = ?`,
      [gameStartTime, JSON.stringify(locations), duelId]
    );
    connection.release();
    console.log(`🎮 Whereami duel finalized: ${duelId}`);

  } catch (error) {
    console.error('❌ Matchmaking error:', error);
    // 如果预创建了对决但后续步骤失败，将其标记为错误状态
    if (duelId) {
      try {
        const errConn = await pool.getConnection();
        await errConn.execute("UPDATE duels SET status = 'error' WHERE id = ?", [duelId]);
        errConn.release();
      } catch (cleanupError) {
        console.error('❌ Failed to mark errored duel:', cleanupError);
      }
    }
    if (connection) {
      try {
        await connection.rollback();
        connection.release();
      } catch (rbError) { /* ignore */ }
    }
  }
}

// Socket.io 用户管理
const userSockets = new Map(); // socketId -> { userId, username, currentDuel }

// 广播决斗更新的函数
function broadcastDuelUpdate(duelId, action, additionalData = {}) {
  console.log(`📢 Broadcasting duel update: ${duelId} - ${action}`);
  
  io.to(duelId).emit('duel_updated', {
    duelId: duelId,
    action: action,
    timestamp: new Date().toISOString(),
    ...additionalData
  });
}

// 向特定决斗房间广播状态更新
async function broadcastDuelStatus(duelId) {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT * FROM duels WHERE id = ?',
      [duelId]
    );
    connection.release();
    
    if (rows.length > 0) {
      const duel = rows[0];
      
      // 向房间内的所有用户发送状态更新
      const socketsInRoom = io.sockets.adapter.rooms.get(duelId);
      if (socketsInRoom) {
        for (const socketId of socketsInRoom) {
          const userInfo = userSockets.get(socketId);
          if (userInfo) {
            const isPlayer1 = duel.player1_uid === userInfo.userId;
            
            io.to(socketId).emit('duel_status_update', {
              duelId: duelId,
              status: duel.status,
              currentRound: duel.current_round,
              player1GuessStatus: !!(duel.player1_guess_lat && duel.player1_guess_lng),
              player2GuessStatus: !!(duel.player2_guess_lat && duel.player2_guess_lng),
              isPlayer1: isPlayer1,
              timestamp: new Date().toISOString()
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Broadcast duel status error:', error);
  }
}

// ROUTES

// Root route
app.get('/', (req, res) => {
  console.log(`🏠 Root route accessed by: ${req.session.user?.username || 'Anonymous'}`);
  
  if (req.session.user) {
    console.log(`✅ User logged in: ${req.session.user.username} (UID: ${req.session.user.uid})`);
    res.redirect('/lobby');
  } else {
    console.log(`🔑 No user session, redirecting to auth`);
    res.redirect('/auth');
  }
});

app.get('/auth', (req, res) => {
  console.log(`🔑 Auth page accessed`);
  
  if (req.session.user) {
    console.log(`✅ User already logged in: ${req.session.user.username}, redirecting to lobby`);
    return res.redirect('/lobby');
  }
  
  res.render('auth.njk', { 
    title: 'Whereami - Login',
    error: req.query.error === 'banned' ? 'Account has been banned' : req.session.error,
    success: req.session.success
  });
  delete req.session.error;
  delete req.session.success;
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`🔑 Login attempt for: ${username}`);
    
    if (!username) {
      req.session.error = 'Username is required';
      return res.redirect('/auth');
    }
    
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );
    connection.release();
    
    if (rows.length === 0) {
      console.log(`❌ User not found: ${username}`);
      req.session.error = 'User not found';
      return res.redirect('/auth');
    }
    
    const user = rows[0];
    
    if (user.user_type === 'Banned') {
      console.log(`❌ Banned user login attempt: ${username}`);
      req.session.error = 'Account has been banned';
      return res.redirect('/auth');
    }
    
    if (user.password_hash && password) {
      const validPassword = await bcrypt.compare(password, user.password_hash);
      if (!validPassword) {
        console.log(`❌ Invalid password for: ${username}`);
        req.session.error = 'Invalid password';
        return res.redirect('/auth');
      }
    } else if (user.password_hash && !password) {
      req.session.error = 'Password required';
      return res.redirect('/auth');
    }
    
    req.session.user = {
      uid: user.uid,
      id: user.id,
      username: user.username,
      email: user.email,
      userType: user.user_type,
      anonymous: user.is_anonymous
    };
    
    // Update last active
    const updateConnection = await pool.getConnection();
    await updateConnection.execute(
      'UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE uid = ?',
      [user.uid]
    );
    updateConnection.release();
    
    console.log(`✅ User logged in: ${user.username} (UID: ${user.uid}, Type: ${user.user_type})`);
    res.redirect('/lobby');
  } catch (error) {
    console.error('❌ Login error:', error);
    req.session.error = 'Login failed';
    res.redirect('/auth');
  }
});

app.post('/auth/register', async (req, res) => {
  let connection;
  try {
    const { username, email, password } = req.body;
    console.log(`👤 Registration attempt for: ${username} from IP: ${req.ip}`);

    if (!username || !email || !password) {
      req.session.error = 'All fields are required';
      return res.redirect('/auth');
    }

    connection = await pool.getConnection();
    // 开始事务，确保检查和插入的原子性
    await connection.beginTransaction();

    // 1. 先检查用户名或邮箱是否已存在
    const [existingUsers] = await connection.execute(
      'SELECT uid FROM users WHERE username = ? OR email = ? FOR UPDATE',
      [username, email]
    );

    // 2. 如果已存在，则回滚事务并返回错误
    if (existingUsers.length > 0) {
      await connection.rollback(); // 回滚事务
      connection.release();
      console.log('❌ Registration failed: Username or email already exists.');
      req.session.error = 'Username or email already exists';
      return res.redirect('/auth');
    }

    // 3. 如果不存在，再执行插入操作
    const userId = generateUUID(); //
    const hashedPassword = await bcrypt.hash(password, 10); //

    const [result] = await connection.execute(
      'INSERT INTO users (id, username, email, password_hash, user_type, registered_at, elo_rating, peak_elo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, username, email, hashedPassword, 'Normal', new Date(), 1500, 1500]
    ); //

    const uid = result.insertId; //

    // 提交事务
    await connection.commit();

    req.session.user = {
      uid: uid,
      id: userId,
      username,
      email,
      userType: 'Normal',
      anonymous: false
    }; //

    const contentToAppend = `New user registered: ${username} (UID: ${uid}) from IP: ${req.ip}\n`;
    fs.appendFileSync('register-log.txt', contentToAppend);
    res.redirect('/lobby');

  } catch (error) {
    // 如果发生任何其他错误，也回滚事务
    if (connection) {
      await connection.rollback();
    }
    console.error('❌ Registration error:', error);
    req.session.error = 'Registration failed';
    res.redirect('/auth');
  } finally {
    if (connection) {
      connection.release();
      console.log('🔗 Connection released.');
    }
  }
});

app.post('/logout', (req, res) => {
  const username = req.session.user?.username;
  req.session.destroy();
  console.log(`🚪 User logged out: ${username}`);
  res.redirect('/auth');
});

app.get('/lobby', requireAuth, async (req, res) => {
  try {
    console.log(`🎪 Lobby accessed by: ${req.session.user.username}`);
    
    console.log(`✅ Rendering lobby for: ${req.session.user.username}`);
    res.render('lobby.njk', {
      title: 'Whereami - Lobby',
      user: req.session.user,
      usernameColor: await getUserColor(req.session.user.uid)
    });
  } catch (error) {
    console.error('❌ Lobby error:', error);
    res.render('lobby.njk', {
      title: 'Whereami - Lobby',
      user: req.session.user,
      error: 'Failed to load lobby'
    });
  }
});

// Matchmaking routes
app.post('/matchmaking/start', requireAuth, async (req, res) => {
  try {
    console.log(`🎯 ${req.session.user.username} starting matchmaking`);
    
    const connection = await pool.getConnection();
    
    await connection.execute(
      'INSERT INTO matchmaking_queue (user_uid) VALUES (?) ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP',
      [req.session.user.uid]
    );
    
    console.log(`✅ ${req.session.user.username} added to matchmaking queue`);
    connection.release();
    
    res.redirect('/queue');
  } catch (error) {
    console.error('❌ Matchmaking error:', error);
    res.redirect('/lobby?error=matchmaking_failed');
  }
});

app.get('/matchmaking/status', requireAuth, async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [duels] = await connection.execute(
      'SELECT id FROM duels WHERE (player1_uid = ? OR player2_uid = ?) AND status IN ("generating", "preparing", "playing", "results") ORDER BY created_at DESC LIMIT 1',
      [req.session.user.uid, req.session.user.uid]
    );

    if (duels.length > 0) {
      connection.release();
      return res.json({ status: 'found', duelId: duels[0].id });
    }

    const [userInQueue] = await connection.execute(
      'SELECT user_uid FROM matchmaking_queue WHERE user_uid = ?',
      [req.session.user.uid]
    );

    if (userInQueue.length === 0) {
      connection.release();
      return res.json({ status: 'not_in_queue' });
    }

    const [queueStats] = await connection.execute(
      'SELECT COUNT(*) as queue_size FROM matchmaking_queue mq JOIN users u ON mq.user_uid = u.uid WHERE mq.created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE) AND u.user_type != "Banned"'
    );

    connection.release();
    
    const queueSize = queueStats[0].queue_size;
    
    return res.json({ status: 'waiting', queueSize: queueSize });

  } catch (error) {
    console.error('❌ Matchmaking status error:', error);
    res.status(500).json({ status: 'error', message: 'Could not fetch status' });
  }
});

app.get('/queue', requireAuth, async (req, res) => {
  try {
    console.log(`🎪 Queue page accessed by: ${req.session.user.username}`);
    
    const connection = await pool.getConnection();
    
    const [duels] = await connection.execute(
      'SELECT id FROM duels WHERE (player1_uid = ? OR player2_uid = ?) AND status IN ("generating", "preparing", "playing", "results") ORDER BY created_at DESC LIMIT 1',
      [req.session.user.uid, req.session.user.uid]
    );
    
    if (duels.length > 0) {
      connection.release();
      console.log(`🎮 Active duel found, redirecting ${req.session.user.username} to duel: ${duels[0].id}`);
      return res.redirect(`/duel/${duels[0].id}`);
    }
    
    const [queueCheck] = await connection.execute(
      'SELECT user_uid FROM matchmaking_queue WHERE user_uid = ?',
      [req.session.user.uid]
    );
    
    if (queueCheck.length === 0) {
      connection.release();
      console.log(`❌ ${req.session.user.username} not in queue, redirecting to lobby`);
      return res.redirect('/lobby');
    }
    
    const [queueStats] = await connection.execute(
      'SELECT COUNT(*) as queue_size FROM matchmaking_queue mq JOIN users u ON mq.user_uid = u.uid WHERE mq.created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE) AND u.user_type != "Banned"'
    );
    
    connection.release();
    
    console.log(`✅ Rendering queue page for: ${req.session.user.username} (${queueStats[0].queue_size} in queue)`);
    res.render('queue.njk', {
      title: 'Whereami - Finding Opponent',
      user: req.session.user,
      queueSize: queueStats[0].queue_size,
      usernameColor: await getUserColor(req.session.user.uid)
    });
  } catch (error) {
    console.error('❌ Queue page error:', error);
    res.redirect('/lobby');
  }
});

app.post('/matchmaking/cancel', requireAuth, async (req, res) => {
  try {
    console.log(`🚪 ${req.session.user.username} canceling matchmaking`);
    
    const connection = await pool.getConnection();
    await connection.execute(
      'DELETE FROM matchmaking_queue WHERE user_uid = ?',
      [req.session.user.uid]
    );
    connection.release();
    
    console.log(`✅ ${req.session.user.username} removed from matchmaking queue`);
    res.redirect('/lobby');
  } catch (error) {
    console.error('❌ Cancel matchmaking error:', error);
    res.redirect('/lobby');
  }
});

// Duel routes
app.get('/duel/:id', requireAuth, async (req, res) => {
  try {
    console.log(`🎮 Duel page accessed: ${req.params.id} by ${req.session.user.username}`);

    const connection = await pool.getConnection();

    // Remove user from matchmaking queue
    await connection.execute(
      'DELETE FROM matchmaking_queue WHERE user_uid = ?',
      [req.session.user.uid]
    );

    // Get duel information
    const [rows] = await connection.execute(
      'SELECT d.*, u1.username as player1_name, u1.uid as player1_uid, u2.username as player2_name, u2.uid as player2_uid FROM duels d JOIN users u1 ON d.player1_uid = u1.uid JOIN users u2 ON d.player2_uid = u2.uid WHERE d.id = ? AND (d.player1_uid = ? OR d.player2_uid = ?)',
      [req.params.id, req.session.user.uid, req.session.user.uid]
    );

    if (rows.length === 0) {
      connection.release();
      console.log(`❌ Duel not found or access denied: ${req.params.id} for ${req.session.user.username}`);
      return res.redirect('/lobby');
    }

    const duel = rows[0];
    if (duel.status === 'generating') {
      connection.release();
      console.log(`⏳ Duel ${duel.id} is still generating, rendering a waiting page.`);
      
      // 我们可以复用 queue.njk 模板来显示等待信息
      // 它上面的轮询脚本会自动处理后续的页面跳转
      return res.render('generating.njk', {
        title: 'Whereami - Creating Your Duel',
        user: req.session.user,
        // 你可以向模板传递一个特定的消息
        message: 'Your match is found! We are generating the locations...',
        usernameColor: await getUserColor(req.session.user.uid)
      });
    }
    const isPlayer1 = duel.player1_uid === req.session.user.uid;
    const opponent = {
      uid: isPlayer1 ? duel.player2_uid : duel.player1_uid,
      name: isPlayer1 ? duel.player2_name : duel.player1_name
    };

    // Parse locations
    let locations = [];
    try {
      locations = JSON.parse(duel.locations || '[]');
    } catch (e) {
      console.error('Failed to parse locations:', e);
      locations = [];
    }

    // Get current round data if in results status
    let currentRoundData = null;
    if (duel.status === 'results' && duel.current_round > 0) {
		const [roundRows] = await connection.execute(
			'SELECT * FROM duel_rounds WHERE duel_id = ? AND round_number = ?',
			[duel.id, duel.current_round]
		);

		if (roundRows.length > 0) {
			currentRoundData = roundRows[0];
		} else if (locations.length > 0 && duel.current_round <= locations.length) {
			// Calculate on the fly if not in database yet
			const currentLocation = locations[duel.current_round - 1];

			// 处理超时或无点击的情况 - 使用 NULL 而不是 -999
			const player1GuessLat = duel.player1_guess_lat;
			const player1GuessLng = duel.player1_guess_lng;
			const player2GuessLat = duel.player2_guess_lat;
			const player2GuessLng = duel.player2_guess_lng;

			const player1Distance = calculateDistance(
				currentLocation.lat, currentLocation.lng,
				player1GuessLat, player1GuessLng
			);
			const player2Distance = calculateDistance(
				currentLocation.lat, currentLocation.lng,
				player2GuessLat, player2GuessLng
			);

			currentRoundData = {
				location_lat: currentLocation.lat,
				location_lng: currentLocation.lng,
				player1_distance: player1Distance,
				player2_distance: player2Distance,
				player1_score: calculateScore(player1Distance),
				player2_score: calculateScore(player2Distance)
			};
		}
    }

    connection.release();

    console.log(`✅ Rendering duel for ${req.session.user.username}: Round ${duel.current_round}/${duel.total_rounds}, Status: ${duel.status}`);

    res.render('duel.njk', {
      title: `Whereami - Round ${duel.current_round} of ${duel.total_rounds}`,
      user: req.session.user,
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      duel: {
        id: duel.id,
        currentRound: duel.current_round,
        totalRounds: duel.total_rounds,
        status: duel.status,
        locations: locations,
        myScore: isPlayer1 ? duel.player1_score : duel.player2_score,
        opponentScore: isPlayer1 ? duel.player2_score : duel.player1_score,
        myGuessLat: isPlayer1 ? duel.player1_guess_lat : duel.player2_guess_lat,
        myGuessLng: isPlayer1 ? duel.player1_guess_lng : duel.player2_guess_lng,
        opponentGuessLat: isPlayer1 ? duel.player2_guess_lat : duel.player1_guess_lat,
        opponentGuessLng: isPlayer1 ? duel.player2_guess_lng : duel.player1_guess_lng,
        // Add current round results data
        myDistance: currentRoundData ? (isPlayer1 ? currentRoundData.player1_distance : currentRoundData.player2_distance) : null,
        opponentDistance: currentRoundData ? (isPlayer1 ? currentRoundData.player2_distance : currentRoundData.player1_distance) : null,
        myRoundScore: currentRoundData ? (isPlayer1 ? currentRoundData.player1_score : currentRoundData.player2_score) : null,
        opponentRoundScore: currentRoundData ? (isPlayer1 ? currentRoundData.player2_score : currentRoundData.player1_score) : null,
        actualLocation: currentRoundData ? { lat: currentRoundData.location_lat, lng: currentRoundData.location_lng } : null,
        firstPickAt: duel.first_pick_at,
        resultsStartAt: duel.results_start_at,
        gameStartAt: duel.game_start_at,
        usernameColor: await getUserColor(req.session.user.uid)
      },
      opponent
    });
  } catch (error) {
    console.error('❌ Duel page error:', error);
    res.redirect('/lobby');
  }
});
app.get('/duel/:id/status', requireAuth, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT d.*, u1.username as player1_name, u1.uid as player1_uid, u2.username as player2_name, u2.uid as player2_uid FROM duels d JOIN users u1 ON d.player1_uid = u1.uid JOIN users u2 ON d.player2_uid = u2.uid WHERE d.id = ? AND (d.player1_uid = ? OR d.player2_uid = ?)',
      [req.params.id, req.session.user.uid, req.session.user.uid]
    );
    if (rows.length === 0) return res.json({ status: 'notfound' });
    const duel = rows[0];
    return res.json({ status: duel.status });
  } catch (error) {
    return res.json({ status: 'errored' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/duel/:id/guess', requireAuth, async (req, res) => {
  try {
    const { guessLat, guessLng } = req.body;

    console.log(`🎯 Guess attempt: ${req.session.user.username} guessed ${guessLat}, ${guessLng} in duel ${req.params.id}`);

    if (!guessLat || !guessLng) {
      console.log(`❌ Invalid guess coordinates`);
      return res.status(400).json({ error: 'Invalid guess coordinates' });
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      'SELECT * FROM duels WHERE id = ? AND (player1_uid = ? OR player2_uid = ?) AND status = "playing"',
      [req.params.id, req.session.user.uid, req.session.user.uid]
    );

    if (rows.length === 0) {
      await connection.rollback();
      connection.release();
      console.log(`❌ Duel not found or not in playing state: ${req.params.id}`);
      return res.status(404).json({ error: 'Duel not found or not in playing state' });
    }

    const duel = rows[0];
    const isPlayer1 = duel.player1_uid === req.session.user.uid;

    // Check if user already guessed
    const currentGuessLat = isPlayer1 ? duel.player1_guess_lat : duel.player2_guess_lat;
    const currentGuessLng = isPlayer1 ? duel.player1_guess_lng : duel.player2_guess_lng;

    if (currentGuessLat !== null && currentGuessLng !== null) {
      await connection.rollback();
      connection.release();
      console.log(`❌ ${req.session.user.username} already guessed in duel ${req.params.id}`);
      return res.status(400).json({ error: 'Already guessed' });
    }

    const updateField1 = isPlayer1 ? 'player1_guess_lat' : 'player2_guess_lat';
    const updateField2 = isPlayer1 ? 'player1_guess_lng' : 'player2_guess_lng';
    const updateField3 = isPlayer1 ? 'player1_last_click_lat' : 'player2_last_click_lat'; // 新增：记录最后点击位置
    const updateField4 = isPlayer1 ? 'player1_last_click_lng' : 'player2_last_click_lng'; // 新增：记录最后点击位置
    const otherGuessLat = isPlayer1 ? duel.player2_guess_lat : duel.player1_guess_lat;
    const otherGuessLng = isPlayer1 ? duel.player2_guess_lng : duel.player1_guess_lng;
    const hasFirstPick = (duel.player1_guess_lat !== null && duel.player1_guess_lng !== null) ||
                        (duel.player2_guess_lat !== null && duel.player2_guess_lng !== null);

    let updateQuery = `UPDATE duels SET ${updateField1} = ?, ${updateField2} = ?, ${updateField3} = ?, ${updateField4} = ?`;
    let updateParams = [parseFloat(guessLat), parseFloat(guessLng), parseFloat(guessLat), parseFloat(guessLng)];

    if (!hasFirstPick) {
      updateQuery += ', first_pick_at = CURRENT_TIMESTAMP';
    }

    if (otherGuessLat !== null && otherGuessLng !== null) {
      updateQuery += ', status = "results", results_start_at = CURRENT_TIMESTAMP';
    }

    updateQuery += ' WHERE id = ?';
    updateParams.push(req.params.id);

    await connection.execute(updateQuery, updateParams);
    await connection.commit();
    connection.release();

    console.log(`✅ Guess successful: ${req.session.user.username} guessed ${guessLat}, ${guessLng}`);

    // 使用新的广播函数
    if (otherGuessLat !== null && otherGuessLng !== null) {
      broadcastDuelUpdate(req.params.id, 'both_guessed');
    } else {
      broadcastDuelUpdate(req.params.id, 'first_guess');
      // 广播状态更新给所有用户
      await broadcastDuelStatus(req.params.id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Guess error:', error);
    res.status(500).json({ error: 'Failed to make guess' });
  }
});

// 添加新的路由来记录地图点击（不提交猜测）
app.post('/duel/:id/click', requireAuth, async (req, res) => {
  try {
    const { clickLat, clickLng } = req.body;

    console.log(`🖱️ Map click: ${req.session.user.username} clicked ${clickLat}, ${clickLng} in duel ${req.params.id}`);

    if (!clickLat || !clickLng) {
      return res.status(400).json({ error: 'Invalid click coordinates' });
    }

    const connection = await pool.getConnection();

    const [rows] = await connection.execute(
      'SELECT * FROM duels WHERE id = ? AND (player1_uid = ? OR player2_uid = ?) AND status = "playing"',
      [req.params.id, req.session.user.uid, req.session.user.uid]
    );

    if (rows.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Duel not found or not in playing state' });
    }

    const duel = rows[0];
    const isPlayer1 = duel.player1_uid === req.session.user.uid;

    // Check if user already guessed
    const currentGuessLat = isPlayer1 ? duel.player1_guess_lat : duel.player2_guess_lat;
    const currentGuessLng = isPlayer1 ? duel.player1_guess_lng : duel.player2_guess_lng;

    if (currentGuessLat !== null && currentGuessLng !== null) {
      connection.release();
      return res.status(400).json({ error: 'Already guessed' });
    }

    const updateField1 = isPlayer1 ? 'player1_last_click_lat' : 'player2_last_click_lat';
    const updateField2 = isPlayer1 ? 'player1_last_click_lng' : 'player2_last_click_lng';

    await connection.execute(
      `UPDATE duels SET ${updateField1} = ?, ${updateField2} = ? WHERE id = ?`,
      [parseFloat(clickLat), parseFloat(clickLng), req.params.id]
    );

    connection.release();

    console.log(`✅ Click recorded: ${req.session.user.username} last click at ${clickLat}, ${clickLng}`);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Click recording error:', error);
    res.status(500).json({ error: 'Failed to record click' });
  }
});

app.post('/duel/:id/leave', requireAuth, async (req, res) => {
  console.error('❌ Leave duel error');
  res.redirect('/lobby');
});

// Leaderboard route
app.get('/leaderboard', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/auth');
  } else {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 50;
      const offset = (page - 1) * limit;
      
      console.log(`🏆 Leaderboard accessed by ${req.session.user?.username || 'Anonymous'}, page ${page}`);
      
      const connection = await pool.getConnection();
      
      // Get total count
      const [countRows] = await connection.execute(
        'SELECT COUNT(*) as total FROM users WHERE user_type != "Banned" AND elo_games >= 1'
      );
      const totalPlayers = countRows[0].total;
      const totalPages = Math.ceil(totalPlayers / limit);
      
      // Get leaderboard data - 修复胜率计算
      const [players] = await connection.execute(
        `SELECT 
          u.uid, u.username, u.user_type, u.elo_rating, u.peak_elo, u.elo_games,
          u.total_duels, u.total_wins, u.total_losses, u.total_draws,
          CASE 
            WHEN u.total_duels > 0 THEN CAST((u.total_wins * 100.0 / u.total_duels) AS DECIMAL(5,2))
            ELSE 0.00 
          END as win_percentage,
          ROW_NUMBER() OVER (ORDER BY u.elo_rating DESC, u.total_duels DESC) as rank_position
        FROM users u
        WHERE u.user_type != "Banned" AND u.elo_games >= 1
        ORDER BY u.elo_rating DESC, u.total_duels DESC
        LIMIT ? OFFSET ?`,
        [limit, offset]
      );
      
      connection.release();
      
      // Calculate rankings and add pagination info
      const playersWithRank = players.map((player, index) => ({
        ...player,
        globalRank: offset + index + 1,
        isCurrentUser: req.session.user && req.session.user.uid === player.uid
      }));

      // Generate color mappings - 修复胜率处理
      const playersColor = {};
      const playersColorOfPeak = {};
      const winPercentage = {};

      playersWithRank.forEach(player => {
        playersColor[player.uid] = getColorByRating(player.elo_rating);
        playersColorOfPeak[player.uid] = getColorByRating(player.peak_elo);
        
        // 确保 win_percentage 是数字类型
        const winRate = parseFloat(player.win_percentage) || 0;
        winPercentage[player.uid] = winRate.toFixed(2);
      });
      
      res.render('leaderboard.njk', {
        players: playersWithRank,
        playersColor,
        playersColorOfPeak,
        winPercentage,
        currentPage: page,
        totalPages,
        totalPlayers,
        currentUser: req.session.user,
        user: req.session.user,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
        prevPage: page - 1,
        nextPage: page + 1,
        title: 'Whereami - Leaderboard',
        usernameColor: await getUserColor(req.session.user.uid)
      });
      
    } catch (error) {
      console.error('❌ Leaderboard error:', error);
      res.status(500).render('error.njk', { 
        message: 'Failed to load leaderboard',
        error: error.message,
        user: req.session.user,
        title: 'Error - Whereami'
      });
    }
  }
});

// User profile routes
app.get('/user/:uid', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/auth');
  } else {
    try {
      const uid = parseInt(req.params.uid);
      if (isNaN(uid)) {
        return res.status(404).render('error.njk', { 
          message: 'Invalid user ID',
          user: req.session.user,
          title: 'Error - Whereami'
        });
      }
      
      const connection = await pool.getConnection();
      
      const [userRows] = await connection.execute(
        'SELECT * FROM users WHERE uid = ?',
        [uid]
      );
      
      if (userRows.length === 0) {
        connection.release();
        return res.status(404).render('error.njk', { 
          message: 'User not found',
          user: req.session.user,
          title: 'Error - Whereami'
        });
      }
      
      const user = userRows[0];
      
      // Get recent duels (last 10)
      const [recentDuels] = await connection.execute(
        `SELECT d.*,
                u1.username as player1_name, u1.uid as player1_uid,
                u2.username as player2_name, u2.uid as player2_uid,
                CASE
                  WHEN d.winner_uid = ? THEN 'win'
                  WHEN d.winner_uid IS NULL AND d.status = 'finished' THEN 'draw'
                  WHEN d.status = 'finished' THEN 'loss'
                  ELSE 'ongoing'
                END as result
        FROM duels d
        JOIN users u1 ON d.player1_uid = u1.uid
        JOIN users u2 ON d.player2_uid = u2.uid
        WHERE (d.player1_uid = ? OR d.player2_uid = ?) AND d.status = 'finished'
        ORDER BY d.finished_at DESC
        LIMIT 10 OFFSET 0`,
        [uid, uid, uid]
      );
      
      connection.release();

      // 修复胜率计算
      let winPercentageValue;
      if (!user.total_duels || user.total_duels === 0) {
        winPercentageValue = '-';
      } else {
        const totalGames = user.total_wins + user.total_losses + user.total_draws;
        if (totalGames === 0) {
          winPercentageValue = '-';
        } else {
          winPercentageValue = ((user.total_wins * 100.0) / totalGames).toFixed(2);
        }
      }

      res.render('user_profile.njk', {
        title: `${user.username} - Profile - Whereami`,
        profileUser: user,
        winPercentage: winPercentageValue,
        recentDuels: recentDuels,
        curUsername: req.session.user.username,
        user: req.session.user,
        profileUserRatingColor: getColorByRating(user.elo_rating),
        profileUserPeakRatingColor: getColorByRating(user.peak_elo),
        usernameColor: await getUserColor(req.session.user.uid)
      });
      
    } catch (error) {
      console.error('❌ User profile error:', error);
      res.status(500).render('error.njk', { 
        message: 'Failed to load user profile',
        error: error.message,
        user: req.session.user,
        title: 'Error - Whereami'
      });
    }
  }
});

// Rating History API
app.get('/api/user/:uid/rating-history', async (req, res) => {
  try {
    const uid = parseInt(req.params.uid);
    const period = req.query.period || 'all';
    
    if (isNaN(uid)) {
      return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }
    
    console.log(`📊 Fetching rating history for user ${uid}, period: ${period}`);
    
    const connection = await pool.getConnection();
    
    // Build query based on period
    let timeFilter = '';
    let queryParams = [uid];
    
    switch (period) {
      case '7':
        timeFilter = 'AND eh.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        break;
      case '30':
        timeFilter = 'AND eh.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        break;
      case 'all':
      default:
        timeFilter = '';
        break;
    }
    
    const query = `
      SELECT 
        eh.old_elo,
        eh.new_elo,
        eh.elo_change,
        eh.result,
        eh.created_at,
        eh.opponent_elo,
        u.username as opponent_name
      FROM elo_history eh
      LEFT JOIN users u ON eh.opponent_uid = u.uid
      WHERE eh.user_uid = ? ${timeFilter}
      ORDER BY eh.created_at ASC
    `;
    
    const [rows] = await connection.execute(query, queryParams);
    connection.release();
    
    console.log(`📈 Found ${rows.length} rating history entries for user ${uid}`);
    
    // Add starting point if we have data
    let historyData = rows;
    
    if (historyData.length > 0) {
      // Add initial point (starting rating)
      const firstEntry = historyData[0];
      const startingPoint = {
        old_elo: firstEntry.old_elo,
        new_elo: firstEntry.old_elo,
        elo_change: 0,
        result: 'start',
        created_at: new Date(new Date(firstEntry.created_at).getTime() - 1000).toISOString(),
        opponent_elo: null,
        opponent_name: 'Starting Rating'
      };
      
      historyData = [startingPoint, ...historyData];
    }
    
    res.json({
      success: true,
      history: historyData,
      period: period,
      count: historyData.length
    });
    
  } catch (error) {
    console.error('❌ Rating history API error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch rating history' 
    });
  }
});

app.post('/user/edit-bio', requireAuth, async (req, res) => {
  try {
    const { bio } = req.body;

    // Validate bio input
    if (typeof bio !== 'string') {
      return res.status(400).json({ success: false, message: 'Bio must be a string' });
    }

    // Trim and validate length
    const trimmedBio = bio.trim();
    if (trimmedBio.length > 500) {
      return res.status(400).json({ success: false, message: 'Bio must be 500 characters or less' });
    }

    // Update bio in database
    const connection = await pool.getConnection();
    await connection.execute(
      'UPDATE users SET profile_bio = ? WHERE uid = ?',
      [trimmedBio || null, req.session.user.uid]
    );
    connection.release();

    res.json({
      success: true,
      message: 'Bio updated successfully',
      bio: trimmedBio
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update bio. Please try again.'
    });
  }
});

// User duels history page (optional)
app.get('/user/:uid/duels', async (req, res) => {
  if (!req.session.user) {
    res.redirect('/auth');
  } else {
    try {
      const uid = parseInt(req.params.uid);
      const page = parseInt(req.query.page) || 1;
      const limit = 20;
      const offset = (page - 1) * limit;

      if (isNaN(uid)) {
        return res.status(404).send('Invalid user ID');
      }

      const connection = await pool.getConnection();

      // Get user info
      const [userRows] = await connection.execute(
        'SELECT * FROM users WHERE uid = ?',
        [uid]
      );

      if (userRows.length === 0) {
        connection.release();
        return res.status(404).send('User not found');
      }

      const user = userRows[0];

      // Get total count
      const [countRows] = await connection.execute(
        `SELECT COUNT(*) as total
         FROM duels d
         WHERE (d.player1_uid = ? OR d.player2_uid = ?) AND d.status = 'finished'`,
        [uid, uid]
      );
      const totalDuels = countRows[0].total;
      const totalPages = Math.ceil(totalDuels / limit);

      // Get duels with pagination
      const [duels] = await connection.execute(
        `SELECT d.*,
                u1.username as player1_name, u1.uid as player1_uid,
                u2.username as player2_name, u2.uid as player2_uid,
                CASE
                  WHEN d.winner_uid = ? THEN 'win'
                  WHEN d.winner_uid IS NULL AND d.status = 'finished' THEN 'draw'
                  WHEN d.status = 'finished' THEN 'loss'
                  ELSE 'ongoing'
                END as result
        FROM duels d
        JOIN users u1 ON d.player1_uid = u1.uid
        JOIN users u2 ON d.player2_uid = u2.uid
        WHERE (d.player1_uid = ? OR d.player2_uid = ?) AND d.status = 'finished'
        ORDER BY d.finished_at DESC
        LIMIT ? OFFSET ?`,
        [uid, uid, uid, limit, offset]
      );

      connection.release();

      res.render('user_duels.njk', {
        title: `${user.username} - Duel History`,
        profileUser: user,
        duels: duels,
        currentPage: page,
        totalPages: totalPages,
        totalDuels: totalDuels,
        user: req.session.user,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
        prevPage: page - 1,
        nextPage: page + 1,
        usernameColor: await getUserColor(req.session.user.uid)
      });

    } catch (error) {
      console.error('❌ User duels history error:', error);
      res.status(500).send('Failed to load duel history');
    }
  }
});

// Server time API
app.get('/api/server-time', (req, res) => {
  res.json({ 
    serverTime: new Date().toISOString(),
    timestamp: Date.now()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).send('Internal Server Error');
});

// 404 handler
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).send(`
    <h1>Page Not Found</h1>
    <p>The route <code>${req.method} ${req.url}</code> does not exist.</p>
    <p><a href="/">Go to Home</a></p>
    <p><a href="/lobby">Go to Lobby</a></p>
  `);
});

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);
  
  // 用户认证和加入决斗房间
  socket.on('join_duel', async (data) => {
    const { duelId, userId, username } = data;
    if (!duelId || !userId) {
      console.error('❌ Invalid join_duel data:', data);
      return;
    }
    
    try {
      // 验证用户是否参与此决斗
      const connection = await pool.getConnection();
      const [duelRows] = await connection.execute(
        'SELECT * FROM duels WHERE id = ? AND (player1_uid = ? OR player2_uid = ?)',
        [duelId, userId, userId]
      );
      connection.release();
      
      if (duelRows.length === 0) {
        console.error(`❌ User ${userId} not authorized for duel ${duelId}`);
        socket.emit('error', { message: 'Not authorized for this duel' });
        return;
      }
      
      // 存储用户信息
      userSockets.set(socket.id, {
        userId: userId,
        username: username,
        currentDuel: duelId
      });
      
      socket.join(duelId);
      console.log(`🎮 User ${username} (${userId}) joined duel room: ${duelId}`);
      
      // 发送加入确认
      socket.emit('duel_joined', { duelId: duelId });
      
    } catch (error) {
      console.error('❌ Join duel error:', error);
      socket.emit('error', { message: 'Failed to join duel' });
    }
  });
  
  // 心跳检测
  socket.on('heartbeat', (data) => {
    const userInfo = userSockets.get(socket.id);
    socket.emit('heartbeat_response', {
      timestamp: Date.now(),
      duelId: data.duelId,
      userId: userInfo?.userId
    });
  });
  
  // 获取决斗状态
  socket.on('get_duel_status', async (data) => {
    const { duelId } = data;
    const userInfo = userSockets.get(socket.id);
    
    if (!duelId || !userInfo) {
      console.error('❌ Invalid get_duel_status request');
      return;
    }
    
    try {
      const connection = await pool.getConnection();
      const [rows] = await connection.execute(
        'SELECT * FROM duels WHERE id = ?',
        [duelId]
      );
      connection.release();
      
      if (rows.length > 0) {
        const duel = rows[0];
        
        // 正确判断用户是否为 player1
        const isPlayer1 = duel.player1_uid === userInfo.userId;
        
        console.log(`📊 Sending status to ${userInfo.username}: isPlayer1=${isPlayer1}, player1_uid=${duel.player1_uid}, user_uid=${userInfo.userId}`);
        
        // 发送状态更新
        socket.emit('duel_status_update', {
          duelId: duelId,
          status: duel.status,
          currentRound: duel.current_round,
          player1GuessStatus: !!(duel.player1_guess_lat && duel.player1_guess_lng),
          player2GuessStatus: !!(duel.player2_guess_lat && duel.player2_guess_lng),
          isPlayer1: isPlayer1,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('❌ Get duel status error:', error);
      socket.emit('error', { message: 'Failed to get duel status' });
    }
  });
  
  socket.on('disconnect', () => {
    const userInfo = userSockets.get(socket.id);
    if (userInfo) {
      console.log(`🔌 User ${userInfo.username} (${userInfo.userId}) disconnected: ${socket.id}`);
      userSockets.delete(socket.id);
    } else {
      console.log(`🔌 User disconnected: ${socket.id}`);
    }
  });
});

// Background tasks
setInterval(async () => {
  if (!pool) return;
  
  try {
    const connection = await pool.getConnection();
    
    // Auto-start games from preparing to playing
    const [preparingDuels] = await connection.execute(
      'SELECT * FROM duels WHERE status = "preparing" AND game_start_at <= NOW()'
    );
    
    for (const duel of preparingDuels) {
      await connection.execute(
        'UPDATE duels SET status = "playing" WHERE id = ?',
        [duel.id]
      );
      
      console.log(`🎮 Whereami duel started: ${duel.id}`);
      broadcastDuelUpdate(duel.id, 'game_started');
    }
    
    // Handle timeouts (15 seconds per round)
    const [timeoutRows] = await connection.execute(
      'SELECT * FROM duels WHERE status = "playing" AND first_pick_at IS NOT NULL AND first_pick_at < DATE_SUB(NOW(), INTERVAL 15 SECOND) AND (player1_guess_lat IS NULL OR player2_guess_lat IS NULL)'
    );
    
    for (const duel of timeoutRows) {
      console.log(`⏰ Processing timeout for duel ${duel.id}`);
      
      // 处理超时：使用最后点击位置或 NULL（表示没有猜测）
      const player1FinalLat = duel.player1_guess_lat !== null ? duel.player1_guess_lat : 
                             (duel.player1_last_click_lat !== null ? duel.player1_last_click_lat : null);
      const player1FinalLng = duel.player1_guess_lng !== null ? duel.player1_guess_lng : 
                             (duel.player1_last_click_lng !== null ? duel.player1_last_click_lng : null);
      
      const player2FinalLat = duel.player2_guess_lat !== null ? duel.player2_guess_lat : 
                             (duel.player2_last_click_lat !== null ? duel.player2_last_click_lat : null);
      const player2FinalLng = duel.player2_guess_lng !== null ? duel.player2_guess_lng : 
                             (duel.player2_last_click_lng !== null ? duel.player2_last_click_lng : null);
      
      console.log(`⏰ Timeout coordinates - Player1: ${player1FinalLat}, ${player1FinalLng} | Player2: ${player2FinalLat}, ${player2FinalLng}`);
      
      await connection.execute(
        'UPDATE duels SET player1_guess_lat = ?, player1_guess_lng = ?, player2_guess_lat = ?, player2_guess_lng = ?, status = "results", results_start_at = CURRENT_TIMESTAMP WHERE id = ?',
        [player1FinalLat, player1FinalLng, player2FinalLat, player2FinalLng, duel.id]
      );
      
      console.log(`⏰ Timeout applied to Whereami duel: ${duel.id}`);
      broadcastDuelUpdate(duel.id, 'timeout');
    }
    
    // Auto-progress from results
    const [resultRows] = await connection.execute(
      'SELECT * FROM duels WHERE status = "results" AND results_start_at < DATE_SUB(NOW(), INTERVAL 10 SECOND)'
    );
    
    
    for (const duel of resultRows) {
      let locations = [];
      try {
        locations = JSON.parse(duel.locations || '[]');
      } catch (e) {
        console.error('Failed to parse locations:', e);
        continue;
      }

      if (locations.length === 0 || duel.current_round > locations.length) {
        console.error(`Invalid location data for duel ${duel.id}`);
        continue;
      }

      const currentLocation = locations[duel.current_round - 1];
      
      // 检查这一轮是否已经被处理过
      const [existingRounds] = await connection.execute(
        'SELECT id FROM duel_rounds WHERE duel_id = ? AND round_number = ?',
        [duel.id, duel.current_round]
      );
      
      if (existingRounds.length > 0) {
        console.log(`⚠️ Round ${duel.current_round} for duel ${duel.id} already processed, skipping...`);
        
        // 直接进入下一轮或结束决斗的逻辑
        const nextRound = duel.current_round + 1;
        
        if (nextRound > duel.total_rounds) {
          // 检查决斗是否已经完成
          if (duel.status !== 'finished') {
            // 计算最终得分
            const [allRounds] = await connection.execute(
              'SELECT player1_score, player2_score FROM duel_rounds WHERE duel_id = ?',
              [duel.id]
            );
            
            let finalPlayer1Score = 0;
            let finalPlayer2Score = 0;
            for (const round of allRounds) {
              finalPlayer1Score += round.player1_score;
              finalPlayer2Score += round.player2_score;
            }
            
            let winnerUid = null;
            let eloResult = 'draw';
            
            if (finalPlayer1Score > finalPlayer2Score) {
              winnerUid = duel.player1_uid;
              eloResult = 'player1_wins';
            } else if (finalPlayer2Score > finalPlayer1Score) {
              winnerUid = duel.player2_uid;
              eloResult = 'player2_wins';
            }
            
            await connection.execute(
              'UPDATE duels SET player1_score = ?, player2_score = ?, status = "finished", winner_uid = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
              [finalPlayer1Score, finalPlayer2Score, winnerUid, duel.id]
            );
            
            // Update ELO ratings
            const eloChanges = await updateEloRatings(connection, duel.id, duel.player1_uid, duel.player2_uid, eloResult);
            
            console.log(`🏁 Whereami duel finished (recovered): ${duel.id}`);
            console.log(`   Winner: ${winnerUid || 'Draw'}`);
            console.log(`   Final scores: ${finalPlayer1Score} - ${finalPlayer2Score}`);
            
            broadcastDuelUpdate(duel.id, 'duel_finished', {
              eloChanges: eloChanges,
              finalScores: { player1: finalPlayer1Score, player2: finalPlayer2Score }
            });
          }
        } else {
          // 进入下一轮（如果还没有进入的话）
          if (duel.current_round < nextRound) {
            await connection.execute(
              'UPDATE duels SET current_round = ?, player1_guess_lat = NULL, player1_guess_lng = NULL, player2_guess_lat = NULL, player2_guess_lng = NULL, player1_last_click_lat = NULL, player1_last_click_lng = NULL, player2_last_click_lat = NULL, player2_last_click_lng = NULL, first_pick_at = NULL, results_start_at = NULL, status = "playing" WHERE id = ?',
              [nextRound, duel.id]
            );
            console.log(`▶️ Next round (recovered): ${duel.id} round ${nextRound}/${duel.total_rounds}`);
            
            broadcastDuelUpdate(duel.id, 'next_round', {
              round: nextRound,
              totalRounds: duel.total_rounds
            });
          }
        }
        continue; // 跳过这个决斗的处理
      }
      
      // Calculate distances and scores
      const player1Distance = calculateDistance(
        currentLocation.lat, currentLocation.lng,
        duel.player1_guess_lat, duel.player1_guess_lng
      );
      const player2Distance = calculateDistance(
        currentLocation.lat, currentLocation.lng,
        duel.player2_guess_lat, duel.player2_guess_lng
      );

      const player1RoundScore = calculateScore(player1Distance);
      const player2RoundScore = calculateScore(player2Distance);

      // 添加得分累加
      let newPlayer1Score = duel.player1_score + player1RoundScore;
      let newPlayer2Score = duel.player2_score + player2RoundScore;
      
      console.log(`📊 Round ${duel.current_round} calculations:`);
      console.log(`   Location: ${currentLocation.lat}, ${currentLocation.lng}`);
      console.log(`   Player1 guess: ${duel.player1_guess_lat}, ${duel.player1_guess_lng}`);
      console.log(`   Player2 guess: ${duel.player2_guess_lat}, ${duel.player2_guess_lng}`);
      console.log(`   Player1 distance: ${player1Distance === -1 ? 'No guess' : player1Distance.toFixed(2) + 'km'}, score: ${player1RoundScore}`);
      console.log(`   Player2 distance: ${player2Distance === -1 ? 'No guess' : player2Distance.toFixed(2) + 'km'}, score: ${player2RoundScore}`);

      // 插入新的轮次记录
      try {
        await connection.execute(
          'INSERT INTO duel_rounds (duel_id, round_number, location_lat, location_lng, player1_guess_lat, player1_guess_lng, player2_guess_lat, player2_guess_lng, player1_distance, player2_distance, player1_score, player2_score, first_pick_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            duel.id, duel.current_round,
            currentLocation.lat, currentLocation.lng,
            duel.player1_guess_lat, duel.player1_guess_lng,
            duel.player2_guess_lat, duel.player2_guess_lng,
            player1Distance, player2Distance,
            player1RoundScore, player2RoundScore,
            duel.first_pick_at
          ]
        );
        console.log(`✅ Round ${duel.current_round} record inserted for duel ${duel.id}`);
      } catch (insertError) {
        if (insertError.code === 'ER_DUP_ENTRY') {
          console.log(`⚠️ Round ${duel.current_round} for duel ${duel.id} already exists, skipping insert...`);
        } else {
          console.error(`❌ Failed to insert round record:`, insertError);
          continue; // 跳过这个决斗的处理
        }
      }
      
      const nextRound = duel.current_round + 1;
      
      if (nextRound > duel.total_rounds) {
        // Finish duel and update ELO ratings
        let winnerUid = null;
        let eloResult = 'draw';
        
        if (newPlayer1Score > newPlayer2Score) {
          winnerUid = duel.player1_uid;
          eloResult = 'player1_wins';
        } else if (newPlayer2Score > newPlayer1Score) {
          winnerUid = duel.player2_uid;
          eloResult = 'player2_wins';
        }
        
        await connection.execute(
          'UPDATE duels SET player1_score = ?, player2_score = ?, status = "finished", winner_uid = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newPlayer1Score, newPlayer2Score, winnerUid, duel.id]
        );
        
        // Update ELO ratings
        const eloChanges = await updateEloRatings(connection, duel.id, duel.player1_uid, duel.player2_uid, eloResult);
        
        console.log(`🏁 Whereami duel finished: ${duel.id}`);
        console.log(`   Winner: ${winnerUid || 'Draw'}`);
        console.log(`   Final scores: ${newPlayer1Score} - ${newPlayer2Score}`);
        
        broadcastDuelUpdate(duel.id, 'duel_finished', {
          eloChanges: eloChanges,
          finalScores: { player1: newPlayer1Score, player2: newPlayer2Score }
        });
      } else {
        // Next round
        await connection.execute(
          'UPDATE duels SET player1_score = ?, player2_score = ?, current_round = ?, player1_guess_lat = NULL, player1_guess_lng = NULL, player2_guess_lat = NULL, player2_guess_lng = NULL, player1_last_click_lat = NULL, player1_last_click_lng = NULL, player2_last_click_lat = NULL, player2_last_click_lng = NULL, first_pick_at = NULL, results_start_at = NULL, status = "playing" WHERE id = ?',
          [newPlayer1Score, newPlayer2Score, nextRound, duel.id]
        );
        console.log(`▶️ Next round: ${duel.id} round ${nextRound}/${duel.total_rounds}`);
        
        broadcastDuelUpdate(duel.id, 'next_round', {
          round: nextRound,
          totalRounds: duel.total_rounds
        });
      }
    }
    connection.release();
  } catch (error) {
    console.error('❌ Background task error:', error);
  }
}, 1000);

// Start server
async function startServer() {
  try {
    console.log('🚀 Starting Whereami Duel server...');
    
    const connected = await createDatabaseConnection();
    if (!connected) {
      console.error('❌ Could not connect to database.');
      process.exit(1);
    }
    
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
    matchmakingLoop();
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
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

async function matchmakingLoop() {
  while (true) {
    try {
      await tryCreateMatch();
    } catch (e) {
      console.error("Error in matchmaking loop:", e);
    }
    // 等待 1 秒再开始下一次
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
