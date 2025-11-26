const express = require('express');
const { getUserColor, getColorByRating, calculateDistance, calculateScore } = require('../utils');
const { requireAuth } = require('../middleware');
const { broadcastDuelUpdate, broadcastDuelStatus } = require('../socket');

function createApiRoutes(pool, io) {
  const router = express.Router();

router.get('/duel/:id', requireAuth, async (req, res) => {
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
      
      // We can reuse the queue.njk template to display waiting information
      // The polling script will automatically handle the subsequent page navigation
      return res.render('generating.njk', {
        title: 'Whereami - Creating Your Duel',
        user: req.session.user,
        // 你可以向模板传递一个特定的消息
        message: 'Your match is found! We are generating the locations...',
        usernameColor: await getUserColor(req.session.user.uid, pool)
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

			// Handle timeout or no-click situations - use NULL instead of -999
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
        usernameColor: await getUserColor(req.session.user.uid, pool)
      },
      opponent
    });
  } catch (error) {
    console.error('❌ Duel page error:', error);
    res.redirect('/lobby');
  }
});
router.get('/duel/:id/status', requireAuth, async (req, res) => {
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

router.post('/duel/:id/guess', requireAuth, async (req, res) => {
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
      broadcastDuelUpdate(io, req.params.id, 'both_guessed');
    } else {
      broadcastDuelUpdate(io, req.params.id, 'first_guess');
      // 广播状态更新给所有用户
      await broadcastDuelStatus(io, pool, req.params.id);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Guess error:', error);
    res.status(500).json({ error: 'Failed to make guess' });
  }
});

// 添加新的路由来记录地图点击（不提交猜测）
router.post('/duel/:id/click', requireAuth, async (req, res) => {
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

router.post('/duel/:id/leave', requireAuth, async (req, res) => {
  console.error('❌ Leave duel error');
  res.redirect('/lobby');
});

// Leaderboard route
router.get('/leaderboard', async (req, res) => {
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
      
				// Fix win rate calculation
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

			// Fix win rate handling
      const playersColor = {};
      const playersColorOfPeak = {};
      const winPercentage = {};

      playersWithRank.forEach(player => {
        playersColor[player.uid] = getColorByRating(player.elo_rating);
        playersColorOfPeak[player.uid] = getColorByRating(player.peak_elo);
        
				// Ensure win_percentage is numeric type
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
        usernameColor: await getUserColor(req.session.user.uid, pool)
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
router.get('/user/:uid', async (req, res) => {
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

				// Fix win rate calculation
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
        usernameColor: await getUserColor(req.session.user.uid, pool)
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
router.get('/api/user/:uid/rating-history', async (req, res) => {
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

router.post('/user/edit-bio', requireAuth, async (req, res) => {
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
router.get('/user/:uid/duels', async (req, res) => {
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
        usernameColor: await getUserColor(req.session.user.uid, pool)
      });

    } catch (error) {
      console.error('❌ User duels history error:', error);
      res.status(500).send('Failed to load duel history');
    }
  }
});

// Server time API
router.get('/api/server-time', (req, res) => {
  res.json({ 
    serverTime: new Date().toISOString(),
    timestamp: Date.now()
  });
});

// Error handling middleware

  return router;
}

module.exports = createApiRoutes;
