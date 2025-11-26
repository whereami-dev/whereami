const { calculateDistance, calculateScore } = require('../utils/helpers');
const { updateEloRatings } = require('./eloRating');
const { broadcastDuelUpdate } = require('../socket/handlers');

/**
 * Start background tasks for managing duel states
 * @param {Server} io - Socket.io server instance
 * @param {Pool} pool - Database connection pool
 */
function startBackgroundTasks(io, pool) {
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
        broadcastDuelUpdate(io, duel.id, 'game_started');
      }
      
      // Handle timeouts (15 seconds per round)
      const [timeoutRows] = await connection.execute(
        'SELECT * FROM duels WHERE status = "playing" AND first_pick_at IS NOT NULL AND first_pick_at < DATE_SUB(NOW(), INTERVAL 15 SECOND) AND (player1_guess_lat IS NULL OR player2_guess_lat IS NULL)'
      );
      
      for (const duel of timeoutRows) {
        console.log(`⏰ Processing timeout for duel ${duel.id}`);
        
        // Handle timeout: use last click position or NULL (no guess)
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
        broadcastDuelUpdate(io, duel.id, 'timeout');
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
        
        // Check if this round has already been processed
        const [existingRounds] = await connection.execute(
          'SELECT id FROM duel_rounds WHERE duel_id = ? AND round_number = ?',
          [duel.id, duel.current_round]
        );
        
        if (existingRounds.length > 0) {
          console.log(`⚠️ Round ${duel.current_round} for duel ${duel.id} already processed, skipping...`);
          
          // Skip to next round or finish duel logic
          const nextRound = duel.current_round + 1;
          
          if (nextRound > duel.total_rounds) {
            // Check if duel is already finished
            if (duel.status !== 'finished') {
              // Calculate final scores
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
              
              broadcastDuelUpdate(io, duel.id, 'duel_finished', {
                eloChanges: eloChanges,
                finalScores: { player1: finalPlayer1Score, player2: finalPlayer2Score }
              });
            }
          } else {
            // Move to next round (if not already there)
            if (duel.current_round < nextRound) {
              await connection.execute(
                'UPDATE duels SET current_round = ?, player1_guess_lat = NULL, player1_guess_lng = NULL, player2_guess_lat = NULL, player2_guess_lng = NULL, player1_last_click_lat = NULL, player1_last_click_lng = NULL, player2_last_click_lat = NULL, player2_last_click_lng = NULL, first_pick_at = NULL, results_start_at = NULL, status = "playing" WHERE id = ?',
                [nextRound, duel.id]
              );
              console.log(`▶️ Next round (recovered): ${duel.id} round ${nextRound}/${duel.total_rounds}`);
              
              broadcastDuelUpdate(io, duel.id, 'next_round', {
                round: nextRound,
                totalRounds: duel.total_rounds
              });
            }
          }
          continue;
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

        // Add score accumulation
        let newPlayer1Score = duel.player1_score + player1RoundScore;
        let newPlayer2Score = duel.player2_score + player2RoundScore;
        
        console.log(`📊 Round ${duel.current_round} calculations:`);
        console.log(`   Location: ${currentLocation.lat}, ${currentLocation.lng}`);
        console.log(`   Player1 guess: ${duel.player1_guess_lat}, ${duel.player1_guess_lng}`);
        console.log(`   Player2 guess: ${duel.player2_guess_lat}, ${duel.player2_guess_lng}`);
        console.log(`   Player1 distance: ${player1Distance === -1 ? 'No guess' : player1Distance.toFixed(2) + 'km'}, score: ${player1RoundScore}`);
        console.log(`   Player2 distance: ${player2Distance === -1 ? 'No guess' : player2Distance.toFixed(2) + 'km'}, score: ${player2RoundScore}`);

        // Insert new round record
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
            continue;
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
          
          broadcastDuelUpdate(io, duel.id, 'duel_finished', {
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
          
          broadcastDuelUpdate(io, duel.id, 'next_round', {
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
}

module.exports = {
  startBackgroundTasks
};
