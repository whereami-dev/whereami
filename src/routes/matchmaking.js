const express = require('express');
const { getUserColor } = require('../utils');
const { requireAuth } = require('../middleware');

function createMatchmakingRoutes(pool) {
  const router = express.Router();

  // Start matchmaking
  router.post('/matchmaking/start', requireAuth, async (req, res) => {
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

  // Get matchmaking status
  router.get('/matchmaking/status', requireAuth, async (req, res) => {
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

  // Queue page
  router.get('/queue', requireAuth, async (req, res) => {
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
        usernameColor: await getUserColor(req.session.user.uid, pool)
      });
    } catch (error) {
      console.error('❌ Queue page error:', error);
      res.redirect('/lobby');
    }
  });

  // Cancel matchmaking
  router.post('/matchmaking/cancel', requireAuth, async (req, res) => {
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

  return router;
}

module.exports = createMatchmakingRoutes;
