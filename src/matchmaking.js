const { generateUUID } = require('./utils');
const { generateValidStreetViewLocation } = require('./location');

// Refactored and Robust tryCreateMatch
async function tryCreateMatch(pool) {
  let connection;
  let duelId = null;

  try {
    // STEP 1: Claim players and pre-create duel in a single atomic transaction
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

    // Remove from queue
    await connection.execute(
      'DELETE FROM matchmaking_queue WHERE user_uid IN (?, ?)',
      [player1.user_uid, player2.user_uid]
    );

    // Create placeholder duel
    duelId = generateUUID();
    await connection.execute(
      `INSERT INTO duels (id, player1_uid, player2_uid, status, player1_elo_before, player2_elo_before) 
       VALUES (?, ?, ?, 'generating', ?, ?)`,
      [duelId, player1.user_uid, player2.user_uid, player1.elo_rating, player2.elo_rating]
    );
    
    // Commit transaction - players are now locked in the duel
    await connection.commit();
    connection.release();
    console.log(`🔒 Players claimed and duel pre-created: ${duelId}`);

    // STEP 2: Perform time-consuming operations outside of transaction
    const locationPromises = Array.from({ length: 5 }, () => generateValidStreetViewLocation());
    const locations = await Promise.all(locationPromises);

    // STEP 3: Update duel to make it playable
    const gameStartTime = new Date(Date.now() + 5000);
    connection = await pool.getConnection();
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
    // If duel was pre-created but subsequent steps failed, mark it as error
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

module.exports = {
  tryCreateMatch
};
