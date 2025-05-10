import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function gamesRoutes(pool) {
  const router = express.Router();

  // Get active game for a room
  router.get('/room/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;

      // Get the most recent game for this room
      const gameResult = await pool.query(
        'SELECT * FROM games WHERE room_id = $1 ORDER BY start_time DESC LIMIT 1',
        [roomId]
      );

      if (gameResult.rows.length === 0) {
        return res.status(404).json({ message: 'No game found for this room' });
      }

      const game = gameResult.rows[0];

      // Get all taps for this game
      const tapsResult = await pool.query(
        `
        SELECT 
          t.user_id, 
          SUM(t.count) as total_taps,
          u.username
        FROM 
          taps t
        JOIN 
          users u ON t.user_id = u.id
        WHERE 
          t.game_id = $1
        GROUP BY 
          t.user_id, u.username
      `,
        [game.id]
      );

      // Combine data
      const gameData = {
        ...game,
        taps: tapsResult.rows,
      };

      res.json(gameData);
    } catch (error) {
      console.error('Error fetching game:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Record taps for a game
  router.post('/:gameId/taps', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { gameId } = req.params;
      const { user_id, count } = req.body;

      if (!user_id || !count) {
        await client.query('ROLLBACK');
        return res
          .status(400)
          .json({ message: 'User ID and tap count are required' });
      }

      // Check if game exists and is active
      const gameCheck = await client.query(
        'SELECT g.*, r.type, r.max_players FROM games g JOIN rooms r ON g.room_id = r.id WHERE g.id = $1 AND g.end_time IS NULL',
        [gameId]
      );

      if (gameCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res
          .status(404)
          .json({ message: 'Game not found or already ended' });
      }

      const game = gameCheck.rows[0];

      // Record taps
      const tapResult = await client.query(
        'INSERT INTO taps (id, game_id, user_id, count) VALUES ($1, $2, $3, $4) RETURNING *',
        [uuidv4(), gameId, user_id, count]
      );

      // Get total taps for this user in this game
      const totalTapsResult = await client.query(
        'SELECT SUM(count) as total_taps FROM taps WHERE game_id = $1 AND user_id = $2',
        [gameId, user_id]
      );

      const totalTaps = parseInt(totalTapsResult.rows[0].total_taps);

      // Check if user has reached the winning threshold (200 taps)
      if (totalTaps >= 200) {
        // Check if there are other players who also reached 200 taps
        // in the same game within a short time window (1 second)
        const tieCheckResult = await client.query(
          `SELECT user_id, SUM(count) as total_taps 
           FROM taps 
           WHERE game_id = $1 
           AND user_id != $2
           AND created_at > NOW() - INTERVAL '1 second'
           GROUP BY user_id 
           HAVING SUM(count) >= 200`,
          [gameId, user_id]
        );

        if (tieCheckResult.rows.length > 0) {
          // We have a tie! Create a tiebreaker game
          const tiebreakerGameId = uuidv4();

          // Create list of tied players including current user
          const tiedPlayers = [
            user_id,
            ...tieCheckResult.rows.map(row => row.user_id),
          ];

          // Create tiebreaker game record
          await client.query(
            'INSERT INTO games (id, room_id, start_time, is_tiebreaker, parent_game_id) VALUES ($1, $2, NOW(), true, $3)',
            [tiebreakerGameId, game.room_id, gameId]
          );

          // Mark original game as having a tiebreaker
          await client.query(
            'UPDATE games SET has_tiebreaker = true WHERE id = $1',
            [gameId]
          );

          // Get usernames for tied players for better logging
          const usernamesResult = await client.query(
            'SELECT id, username FROM users WHERE id = ANY($1)',
            [tiedPlayers]
          );

          const usernames = usernamesResult.rows.reduce((acc, row) => {
            acc[row.id] = row.username;
            return acc;
          }, {});

          console.log(
            `Tiebreaker initiated for game ${gameId} between players: ${tiedPlayers.map(id => usernames[id] || id).join(', ')}`
          );

          await client.query('COMMIT');
          res.status(201).json({
            tap: tapResult.rows[0],
            total_taps: totalTaps,
            tiebreaker: {
              gameId: tiebreakerGameId,
              players: tiedPlayers,
              message:
                'Ничья! Начинается тайбрейкер между игроками с одинаковым результатом.',
            },
          });
        } else {
          // No tie, this player wins
          await endGame(client, gameId, user_id);
          await client.query('COMMIT');
          res.status(201).json({
            tap: tapResult.rows[0],
            total_taps: totalTaps,
            winner: true,
          });
        }
      } else {
        await client.query('COMMIT');
        res.status(201).json({
          tap: tapResult.rows[0],
          total_taps: totalTaps,
        });
      }
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error recording taps:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });

  // End a game (time expired)
  router.post('/:gameId/end', async (req, res) => {
    const client = await pool.connect();

    try {
      const { gameId } = req.params;

      await client.query('BEGIN');

      // Check if game exists and is active
      const gameCheck = await client.query(
        'SELECT * FROM games WHERE id = $1 AND end_time IS NULL',
        [gameId]
      );

      if (gameCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res
          .status(404)
          .json({ message: 'Game not found or already ended' });
      }

      // Find the winner (player with most taps)
      const winnerResult = await client.query(
        `
        SELECT 
          user_id, 
          SUM(count) as total_taps
        FROM 
          taps
        WHERE 
          game_id = $1
        GROUP BY 
          user_id
        ORDER BY 
          total_taps DESC
        LIMIT 1
      `,
        [gameId]
      );

      let winnerId = null;

      if (winnerResult.rows.length > 0) {
        winnerId = winnerResult.rows[0].user_id;
      }

      // End the game
      const gameResult = await endGameInternal(client, gameId, winnerId);

      await client.query('COMMIT');
      res.json(gameResult);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error ending game:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });

  // Helper function to end a game when a player reaches the threshold
  async function endGame(client, gameId, winnerId) {
    try {
      return await endGameInternal(client, gameId, winnerId);
    } catch (error) {
      console.error('Error in endGame helper:', error);
      throw error;
    }
  }

  // Internal function to end a game
  async function endGameInternal(client, gameId, winnerId) {
    // Update game record
    const gameResult = await client.query(
      'UPDATE games SET end_time = NOW(), winner_id = $1 WHERE id = $2 RETURNING *',
      [winnerId, gameId]
    );

    const game = gameResult.rows[0];

    // Get room info
    const roomResult = await client.query('SELECT * FROM rooms WHERE id = $1', [
      game.room_id,
    ]);

    const room = roomResult.rows[0];

    // Update room status
    await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
      'finished',
      room.id,
    ]);

    // If there's a winner, award the prize
    if (winnerId) {
      // Calculate prize pool
      const participantsResult = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [room.id]
      );

      const participantCount = parseInt(participantsResult.rows[0].count);
      const prizePool = parseFloat(room.entry_fee) * participantCount;

      // Different prize distribution based on room type
      if (room.type === 'hero') {
        // Hero room: 90% to winner, 7% to creator, 3% to developer
        const winnerPrize = Math.floor(prizePool * 0.9);
        const creatorPrize = Math.floor(prizePool * 0.07);
        const developerFee = prizePool - winnerPrize - creatorPrize;

        // Award prize to winner
        await client.query(
          'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
          [winnerPrize, winnerId]
        );

        // Record winner transaction
        await client.query(
          'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
          [
            uuidv4(),
            winnerId,
            winnerPrize,
            'payout',
            `Prize for winning hero game ${gameId}`,
          ]
        );

        // Award commission to room creator if different from winner
        if (room.creator_id !== winnerId) {
          await client.query(
            'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
            [creatorPrize, room.creator_id]
          );

          // Record creator commission transaction
          await client.query(
            'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
            [
              uuidv4(),
              room.creator_id,
              creatorPrize,
              'payout',
              `Commission for organizing hero game ${gameId}`,
            ]
          );
        } else {
          // If winner is creator, they get their commission too
          await client.query(
            'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
            [creatorPrize, winnerId]
          );

          // Record combined prize transaction
          await client.query(
            'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
            [
              uuidv4(),
              winnerId,
              creatorPrize,
              'payout',
              `Creator commission for hero game ${gameId}`,
            ]
          );
        }

        // Developer fee is kept in the system (not awarded to any user)
      } else {
        // Standard/Bonus room: 90% to winner, 10% to developer
        const winnerPrize = Math.floor(prizePool * 0.9);

        // Award prize to winner
        await client.query(
          'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
          [winnerPrize, winnerId]
        );

        // Record transaction
        await client.query(
          'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
          [
            uuidv4(),
            winnerId,
            winnerPrize,
            'payout',
            `Prize for winning ${room.type} game ${gameId}`,
          ]
        );
      }
    }

    return gameResult.rows[0];
  }

  return router;
}
