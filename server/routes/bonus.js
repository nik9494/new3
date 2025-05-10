import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function bonusRoutes(pool) {
  const router = express.Router();

  // Constants
  const BONUS_TARGET_TAPS = 10000000; // 10 million taps as per requirements
  const BONUS_TIME_LIMIT = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  const BONUS_REWARD = 3000; // 3000 Stars

  // Get bonus progress for a user
  router.get('/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await pool.query(
        'SELECT * FROM bonus_progress WHERE user_id = $1 ORDER BY start_time DESC LIMIT 1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.json({
          user_id: userId,
          taps_so_far: 0,
          start_time: null,
          end_time: null,
          completed: false,
          target_taps: BONUS_TARGET_TAPS,
          time_limit_ms: BONUS_TIME_LIMIT,
          reward: BONUS_REWARD,
        });
      }

      const progress = result.rows[0];

      // Calculate time remaining if challenge is active
      let timeRemaining = null;
      if (progress.start_time && !progress.completed && !progress.end_time) {
        const startTime = new Date(progress.start_time).getTime();
        const now = Date.now();
        const elapsed = now - startTime;
        timeRemaining = Math.max(0, BONUS_TIME_LIMIT - elapsed);

        // If time has expired but not marked as ended, update it
        if (timeRemaining <= 0) {
          await pool.query(
            'UPDATE bonus_progress SET end_time = NOW() WHERE id = $1',
            [progress.id]
          );
          progress.end_time = new Date();
        }
      }

      res.json({
        ...progress,
        target_taps: BONUS_TARGET_TAPS,
        time_remaining_ms: timeRemaining,
        time_limit_ms: BONUS_TIME_LIMIT,
        reward: BONUS_REWARD,
      });
    } catch (error) {
      console.error('Error fetching bonus progress:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Start a bonus challenge
  router.post('/start', async (req, res) => {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ message: 'User ID is required' });
      }

      // Check if user exists
      const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [
        user_id,
      ]);

      if (userCheck.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Check if user has an active challenge
      const activeCheck = await pool.query(
        `
        SELECT * FROM bonus_progress 
        WHERE user_id = $1 
        AND start_time > NOW() - INTERVAL '24 hours'
        AND completed = false
        AND end_time IS NULL
      `,
        [user_id]
      );

      if (activeCheck.rows.length > 0) {
        return res.status(400).json({
          message: 'User already has an active bonus challenge',
          progress: activeCheck.rows[0],
        });
      }

      // Create new bonus challenge
      const progressResult = await pool.query(
        'INSERT INTO bonus_progress (id, user_id, taps_so_far, start_time) VALUES ($1, $2, $3, NOW()) RETURNING *',
        [uuidv4(), user_id, 0]
      );

      res.status(201).json({
        ...progressResult.rows[0],
        target_taps: BONUS_TARGET_TAPS,
        time_limit_ms: BONUS_TIME_LIMIT,
        reward: BONUS_REWARD,
      });
    } catch (error) {
      console.error('Error starting bonus challenge:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Record taps for a bonus challenge
  router.post('/taps', async (req, res) => {
    try {
      const { user_id, taps } = req.body;

      if (!user_id || !taps) {
        return res
          .status(400)
          .json({ message: 'User ID and taps are required' });
      }

      // Get the active bonus challenge
      const progressResult = await pool.query(
        `
        SELECT * FROM bonus_progress 
        WHERE user_id = $1 
        AND start_time > NOW() - INTERVAL '24 hours'
        AND completed = false
        AND end_time IS NULL
        ORDER BY start_time DESC 
        LIMIT 1
      `,
        [user_id]
      );

      if (progressResult.rows.length === 0) {
        return res
          .status(404)
          .json({ message: 'No active bonus challenge found' });
      }

      const progress = progressResult.rows[0];

      // Check if time has expired
      const startTime = new Date(progress.start_time).getTime();
      const now = Date.now();
      const elapsed = now - startTime;

      if (elapsed >= BONUS_TIME_LIMIT) {
        // Time expired, mark as ended
        await pool.query(
          'UPDATE bonus_progress SET end_time = NOW() WHERE id = $1',
          [progress.id]
        );

        return res.status(400).json({
          message: 'Bonus challenge time expired',
          progress: {
            ...progress,
            end_time: new Date(),
            target_taps: BONUS_TARGET_TAPS,
            time_limit_ms: BONUS_TIME_LIMIT,
            reward: BONUS_REWARD,
          },
        });
      }

      // Update taps count
      const newTapsTotal = parseInt(progress.taps_so_far) + parseInt(taps);
      const updateResult = await pool.query(
        'UPDATE bonus_progress SET taps_so_far = $1 WHERE id = $2 RETURNING *',
        [newTapsTotal, progress.id]
      );

      const updatedProgress = updateResult.rows[0];

      // Check if target reached
      if (newTapsTotal >= BONUS_TARGET_TAPS) {
        // Mark as completed
        await pool.query(
          'UPDATE bonus_progress SET completed = true WHERE id = $1',
          [progress.id]
        );

        // Award bonus
        await pool.query(
          'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
          [BONUS_REWARD, user_id]
        );

        // Record transaction
        await pool.query(
          'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
          [uuidv4(), user_id, BONUS_REWARD, 'payout', 'Bonus challenge reward']
        );

        updatedProgress.completed = true;
      }

      res.json({
        ...updatedProgress,
        target_taps: BONUS_TARGET_TAPS,
        time_remaining_ms: BONUS_TIME_LIMIT - elapsed,
        time_limit_ms: BONUS_TIME_LIMIT,
        reward: BONUS_REWARD,
      });
    } catch (error) {
      console.error('Error recording bonus taps:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Reset a bonus challenge
  router.post('/reset', async (req, res) => {
    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ message: 'User ID is required' });
      }

      // Get the active or most recent bonus challenge
      const progressResult = await pool.query(
        `
        SELECT * FROM bonus_progress 
        WHERE user_id = $1 
        ORDER BY start_time DESC 
        LIMIT 1
      `,
        [user_id]
      );

      if (progressResult.rows.length === 0) {
        return res.status(404).json({ message: 'No bonus challenge found' });
      }

      const progress = progressResult.rows[0];

      // If challenge is completed and reward was given, don't allow reset
      if (progress.completed) {
        return res.status(400).json({
          message: 'Cannot reset a completed challenge',
          progress,
        });
      }

      // Mark the current challenge as ended
      await pool.query(
        'UPDATE bonus_progress SET end_time = NOW() WHERE id = $1',
        [progress.id]
      );

      res.json({
        message: 'Bonus challenge reset successfully',
        previous_progress: progress,
      });
    } catch (error) {
      console.error('Error resetting bonus challenge:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  return router;
}
