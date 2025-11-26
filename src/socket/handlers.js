// Socket.io user management
const userSockets = new Map(); // socketId -> { userId, username, currentDuel }

/**
 * Broadcast duel update to all players in a duel room
 * @param {Server} io - Socket.io server instance
 * @param {string} duelId - Duel ID
 * @param {string} action - Action type
 * @param {object} additionalData - Additional data to broadcast
 */
function broadcastDuelUpdate(io, duelId, action, additionalData = {}) {
  console.log(`📢 Broadcasting duel update: ${duelId} - ${action}`);
  
  io.to(duelId).emit('duel_updated', {
    duelId: duelId,
    action: action,
    timestamp: new Date().toISOString(),
    ...additionalData
  });
}

/**
 * Broadcast duel status to specific duel room
 * @param {Server} io - Socket.io server instance
 * @param {Pool} pool - Database connection pool
 * @param {string} duelId - Duel ID
 */
async function broadcastDuelStatus(io, pool, duelId) {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(
      'SELECT * FROM duels WHERE id = ?',
      [duelId]
    );
    connection.release();
    
    if (rows.length > 0) {
      const duel = rows[0];
      
      // Send status updates to all users in the room
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

/**
 * Initialize Socket.io connection handlers
 * @param {Server} io - Socket.io server instance
 * @param {Pool} pool - Database connection pool
 */
function initializeSocketHandlers(io, pool) {
  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);
    
    // User authentication and join duel room
    socket.on('join_duel', async (data) => {
      const { duelId, userId, username } = data;
      if (!duelId || !userId) {
        console.error('❌ Invalid join_duel data:', data);
        return;
      }
      
      try {
        // Verify user is participating in this duel
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
        
        // Store user information
        userSockets.set(socket.id, {
          userId: userId,
          username: username,
          currentDuel: duelId
        });
        
        socket.join(duelId);
        console.log(`🎮 User ${username} (${userId}) joined duel room: ${duelId}`);
        
        // Send join confirmation
        socket.emit('duel_joined', { duelId: duelId });
        
      } catch (error) {
        console.error('❌ Join duel error:', error);
        socket.emit('error', { message: 'Failed to join duel' });
      }
    });
    
    // Heartbeat detection
    socket.on('heartbeat', (data) => {
      const userInfo = userSockets.get(socket.id);
      socket.emit('heartbeat_response', {
        timestamp: Date.now(),
        duelId: data.duelId,
        userId: userInfo?.userId
      });
    });
    
    // Get duel status
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
          
          // Correctly determine if user is player1
          const isPlayer1 = duel.player1_uid === userInfo.userId;
          
          console.log(`📊 Sending status to ${userInfo.username}: isPlayer1=${isPlayer1}, player1_uid=${duel.player1_uid}, user_uid=${userInfo.userId}`);
          
          // Send status update
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
}

module.exports = {
  userSockets,
  broadcastDuelUpdate,
  broadcastDuelStatus,
  initializeSocketHandlers
};
