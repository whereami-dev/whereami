/**
 * ELO Rating System for competitive matchmaking
 */
class EloRatingSystem {
  /**
   * @param {object} config - Configuration object
   * @param {number} [config.kFactor=32] - K-factor, determines maximum rating change
   * @param {number} [config.eloDivisor=400] - Divisor used in expected score calculation
   */
  constructor(config = {}) {
    const defaultConfig = {
      kFactor: 64,
      eloDivisor: 400,
    };
    this.config = { ...defaultConfig, ...config };
  }

  /**
   * Calculate expected score for player A against player B
   * @param {number} ratingA - Player A's rating
   * @param {number} ratingB - Player B's rating
   * @returns {number} Expected score for player A (between 0 and 1)
   */
  getExpectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / this.config.eloDivisor));
  }

  /**
   * Calculate new ratings after a match
   * @param {number} player1Rating - Player 1's current rating
   * @param {number} player2Rating - Player 2's current rating
   * @param {'win' | 'loss' | 'draw'} player1Result - Player 1's match result
   * @returns {{newRating1: number, newRating2: number, change1: number, change2: number}} New ratings and changes
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
        // If result is invalid, ratings don't change
        return {
          newRating1: player1Rating,
          newRating2: player2Rating,
          change1: 0,
          change2: 0,
        };
    }

    const expectedScore1 = this.getExpectedScore(player1Rating, player2Rating);
    const { kFactor } = this.config;

    // Standard ELO calculation: K-factor * (actual score - expected score)
    const ratingChange = kFactor * (score1 - expectedScore1);
    const roundedChange = Math.round(ratingChange);

    // Changes are symmetric
    const newRating1 = player1Rating + roundedChange;
    const newRating2 = player2Rating - roundedChange;

    return {
      newRating1,
      newRating2,
      change1: roundedChange,
      change2: -roundedChange,
    };
  }
}

/**
 * Update ELO ratings after a duel
 * @param {Connection} connection - Database connection
 * @param {string} duelId - Duel ID
 * @param {string} player1Uid - Player 1 UID
 * @param {string} player2Uid - Player 2 UID
 * @param {string} result - Match result ('player1_wins', 'player2_wins', 'draw')
 * @returns {Promise<object>} Rating changes for both players
 */
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

    // Determine ELO result strings based on match result
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
        return;
    }

    // Calculate new ELO ratings
    const eloCalculationResult = ratingSystem.calculate(player1OldRating, player2OldRating, player1ResultStr);

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

module.exports = {
  EloRatingSystem,
  updateEloRatings
};
