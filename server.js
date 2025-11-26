require('dotenv').config();
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const moment = require('moment-timezone');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Import custom modules
const { createDatabaseConnection, getPool, getUserColor } = require('./src/config/database');
const { configureNunjucks } = require('./src/config/nunjucks');
const { setupAuthRoutes } = require('./src/routes/auth');
const { setupMatchmakingRoutes } = require('./src/routes/matchmaking');
const { requireAuth } = require('./src/middleware/auth');
const { calculateDistance, calculateScore, generateUUID } = require('./src/utils/helpers');
const { initializeSocketHandlers, broadcastDuelUpdate, broadcastDuelStatus } = require('./src/socket/handlers');
const { matchmakingLoop } = require('./src/services/matchmaking');
const { updateEloRatings } = require('./src/services/eloRating');
const { startBackgroundTasks } = require('./src/services/backgroundTasks');

const app = express();
const server = createServer(app);
const io = new Server(server);

const PORT = process.env.PORT;

// Configure Nunjucks
configureNunjucks(app);

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

// Setup routes
app.use('/', setupAuthRoutes(getPool));
app.use('/', requireAuth, setupMatchmakingRoutes(getPool));

// Duel routes (consolidated here to keep refactoring minimal)
app.get('/duel/:id', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
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
      
      return res.render('generating.njk', {
        title: 'Whereami - Creating Your Duel',
        user: req.session.user,
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
			const currentLocation = locations[duel.current_round - 1];

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
    const pool = getPool();
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
  const pool = getPool();
  const connection = await pool.getConnection();
  
  try {
    const { lat, lng } = req.body;
    const duelId = req.params.id;
    
    console.log(`🎯 Guess submitted for duel ${duelId} by ${req.session.user.username}: ${lat}, ${lng}`);
    
    const [duelRows] = await connection.execute(
      'SELECT * FROM duels WHERE id = ? AND (player1_uid = ? OR player2_uid = ?) AND status = "playing"',
      [duelId, req.session.user.uid, req.session.user.uid]
    );
    
    if (duelRows.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, error: 'Duel not found or not in playing status' });
    }
    
    const duel = duelRows[0];
    const isPlayer1 = duel.player1_uid === req.session.user.uid;
    
    if (isPlayer1 && duel.player1_guess_lat !== null) {
      connection.release();
      return res.status(400).json({ success: false, error: 'Already submitted guess' });
    }
    if (!isPlayer1 && duel.player2_guess_lat !== null) {
      connection.release();
      return res.status(400).json({ success: false, error: 'Already submitted guess' });
    }
    
    if (isPlayer1) {
      await connection.execute(
        'UPDATE duels SET player1_guess_lat = ?, player1_guess_lng = ?, first_pick_at = COALESCE(first_pick_at, CURRENT_TIMESTAMP) WHERE id = ?',
        [lat, lng, duelId]
      );
    } else {
      await connection.execute(
        'UPDATE duels SET player2_guess_lat = ?, player2_guess_lng = ?, first_pick_at = COALESCE(first_pick_at, CURRENT_TIMESTAMP) WHERE id = ?',
        [lat, lng, duelId]
      );
    }
    
    const [updatedDuel] = await connection.execute(
      'SELECT * FROM duels WHERE id = ?',
      [duelId]
    );
    
    if (updatedDuel[0].player1_guess_lat !== null && updatedDuel[0].player2_guess_lat !== null) {
      await connection.execute(
        'UPDATE duels SET status = "results", results_start_at = CURRENT_TIMESTAMP WHERE id = ?',
        [duelId]
      );
      console.log(`✅ Both players guessed for duel ${duelId}, moving to results`);
      broadcastDuelUpdate(io, duelId, 'both_guessed');
    } else {
      console.log(`⏳ Waiting for other player in duel ${duelId}`);
      broadcastDuelStatus(io, pool, duelId);
    }
    
    connection.release();
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Guess submission error:', error);
    connection.release();
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/duel/:id/click', requireAuth, async (req, res) => {
  const pool = getPool();
  const connection = await pool.getConnection();
  
  try {
    const { lat, lng } = req.body;
    const duelId = req.params.id;
    
    const [duelRows] = await connection.execute(
      'SELECT * FROM duels WHERE id = ? AND (player1_uid = ? OR player2_uid = ?) AND status = "playing"',
      [duelId, req.session.user.uid, req.session.user.uid]
    );
    
    if (duelRows.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, error: 'Duel not found' });
    }
    
    const duel = duelRows[0];
    const isPlayer1 = duel.player1_uid === req.session.user.uid;
    
    if (isPlayer1) {
      await connection.execute(
        'UPDATE duels SET player1_last_click_lat = ?, player1_last_click_lng = ? WHERE id = ?',
        [lat, lng, duelId]
      );
    } else {
      await connection.execute(
        'UPDATE duels SET player2_last_click_lat = ?, player2_last_click_lng = ? WHERE id = ?',
        [lat, lng, duelId]
      );
    }
    
    connection.release();
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Click recording error:', error);
    connection.release();
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/duel/:id/leave', requireAuth, async (req, res) => {
  console.log(`🚪 ${req.session.user.username} leaving duel ${req.params.id}`);
  res.redirect('/lobby');
});

// Leaderboard route
app.get('/leaderboard', async (req, res) => {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();
    
    const [rows] = await connection.execute(
      'SELECT uid, username, elo_rating, peak_elo, elo_games, total_wins, total_losses, total_draws FROM users WHERE elo_games > 0 ORDER BY elo_rating DESC LIMIT 100'
    );
    
    connection.release();
    
    console.log(`📊 Leaderboard accessed, ${rows.length} users shown`);
    
    res.render('leaderboard.njk', {
      title: 'Whereami - Leaderboard',
      user: req.session.user,
      players: rows,
      usernameColor: req.session.user ? await getUserColor(req.session.user.uid) : null
    });
  } catch (error) {
    console.error('❌ Leaderboard error:', error);
    res.render('leaderboard.njk', {
      title: 'Whereami - Leaderboard',
      user: req.session.user,
      players: [],
      error: 'Failed to load leaderboard'
    });
  }
});

// User profile routes
app.get('/user/:uid', async (req, res) => {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();
    
    const [userRows] = await connection.execute(
      'SELECT uid, username, elo_rating, peak_elo, elo_games, total_wins, total_losses, total_draws, bio, registered_at FROM users WHERE uid = ?',
      [req.params.uid]
    );
    
    if (userRows.length === 0) {
      connection.release();
      return res.status(404).render('error.njk', {
        title: 'User Not Found',
        user: req.session.user,
        error: 'User not found'
      });
    }
    
    const profileUser = userRows[0];
    const winRate = profileUser.elo_games > 0 
      ? ((profileUser.total_wins / profileUser.elo_games) * 100).toFixed(1)
      : 0;
    
    const [recentDuels] = await connection.execute(
      `SELECT d.id, d.player1_uid, d.player2_uid, d.winner_uid, d.player1_score, d.player2_score, d.finished_at,
              u1.username as player1_name, u2.username as player2_name,
              d.elo_change_player1, d.elo_change_player2
       FROM duels d
       JOIN users u1 ON d.player1_uid = u1.uid
       JOIN users u2 ON d.player2_uid = u2.uid
       WHERE (d.player1_uid = ? OR d.player2_uid = ?) AND d.status = 'finished'
       ORDER BY d.finished_at DESC
       LIMIT 10`,
      [req.params.uid, req.params.uid]
    );
    
    connection.release();
    
    const recentDuelsFormatted = recentDuels.map(duel => {
      const isPlayer1 = duel.player1_uid === parseInt(req.params.uid);
      return {
        id: duel.id,
        opponent: isPlayer1 ? duel.player2_name : duel.player1_name,
        myScore: isPlayer1 ? duel.player1_score : duel.player2_score,
        opponentScore: isPlayer1 ? duel.player2_score : duel.player1_score,
        result: duel.winner_uid === null ? 'Draw' : (duel.winner_uid === parseInt(req.params.uid) ? 'Win' : 'Loss'),
        eloChange: isPlayer1 ? duel.elo_change_player1 : duel.elo_change_player2,
        finished_at: duel.finished_at
      };
    });
    
    res.render('profile.njk', {
      title: `${profileUser.username} - Profile`,
      user: req.session.user,
      profileUser: profileUser,
      winRate: winRate,
      recentDuels: recentDuelsFormatted,
      usernameColor: await getUserColor(profileUser.uid)
    });
  } catch (error) {
    console.error('❌ Profile error:', error);
    res.status(500).render('error.njk', {
      title: 'Error',
      user: req.session.user,
      error: 'Failed to load profile'
    });
  }
});

// Rating history API
app.get('/api/user/:uid/rating-history', async (req, res) => {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();
    
    const [history] = await connection.execute(
      `SELECT eh.created_at, eh.old_elo, eh.new_elo, eh.elo_change, eh.result,
              u.username as opponent_username, eh.opponent_elo
       FROM elo_history eh
       JOIN users u ON eh.opponent_uid = u.uid
       WHERE eh.user_uid = ?
       ORDER BY eh.created_at DESC
       LIMIT 50`,
      [req.params.uid]
    );
    
    connection.release();
    
    const formattedHistory = history.map(record => ({
      date: record.created_at,
      oldRating: record.old_elo,
      newRating: record.new_elo,
      change: record.elo_change,
      result: record.result,
      opponent: record.opponent_username,
      opponentRating: record.opponent_elo
    }));
    
    res.json({ success: true, history: formattedHistory });
  } catch (error) {
    console.error('❌ Rating history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch rating history' });
  }
});

app.post('/user/edit-bio', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const { bio } = req.body;
    
    const connection = await pool.getConnection();
    await connection.execute(
      'UPDATE users SET bio = ? WHERE uid = ?',
      [bio, req.session.user.uid]
    );
    connection.release();
    
    res.redirect(`/user/${req.session.user.uid}`);
  } catch (error) {
    console.error('❌ Edit bio error:', error);
    res.redirect(`/user/${req.session.user.uid}?error=update_failed`);
  }
});

// User duels history page
app.get('/user/:uid/duels', async (req, res) => {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();
    
    const [userRows] = await connection.execute(
      'SELECT uid, username FROM users WHERE uid = ?',
      [req.params.uid]
    );
    
    if (userRows.length === 0) {
      connection.release();
      return res.status(404).send('User not found');
    }
    
    const profileUser = userRows[0];
    
    const [duels] = await connection.execute(
      `SELECT d.id, d.player1_uid, d.player2_uid, d.winner_uid, d.player1_score, d.player2_score, d.finished_at,
              u1.username as player1_name, u2.username as player2_name
       FROM duels d
       JOIN users u1 ON d.player1_uid = u1.uid
       JOIN users u2 ON d.player2_uid = u2.uid
       WHERE (d.player1_uid = ? OR d.player2_uid = ?) AND d.status = 'finished'
       ORDER BY d.finished_at DESC`,
      [req.params.uid, req.params.uid]
    );
    
    connection.release();
    
    res.render('user_duels.njk', {
      title: `${profileUser.username} - Duel History`,
      user: req.session.user,
      profileUser: profileUser,
      duels: duels
    });
  } catch (error) {
    console.error('❌ User duels error:', error);
    res.status(500).send('Internal server error');
  }
});

// Server time API
app.get('/api/server-time', (req, res) => {
  res.json({ serverTime: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).send('Something went wrong!');
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error.njk', {
    title: '404 - Not Found',
    user: req.session.user,
    error: 'Page not found'
  });
});

// Initialize Socket.io handlers
initializeSocketHandlers(io, getPool());

// Start server
async function startServer() {
  try {
    console.log('🚀 Starting Whereami server...');
    
    // Connect to database
    const dbConnected = await createDatabaseConnection();
    if (!dbConnected) {
      console.error('❌ Failed to connect to database');
      process.exit(1);
    }
    
    // Start server
    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      
      // Test database connection
      console.log('🔍 Testing database connection...');
      getPool().getConnection()
        .then(connection => {
          console.log('✅ Database connection test successful');
          connection.release();
        })
        .catch(error => {
          console.error('❌ Database connection test failed:', error);
        });
    });
    
    // Start background tasks
    startBackgroundTasks(io, getPool());
    
    // Start matchmaking loop
    matchmakingLoop(getPool());
    
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
