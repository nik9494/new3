import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function referralsRoutes(pool) {
  const router = express.Router();

  // Get referral code for a user
  router.get('/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      const result = await pool.query(
        'SELECT * FROM referrals WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Referral code not found' });
      }

      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error fetching referral code:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Get referral uses for a user
  router.get('/user/:userId/uses', async (req, res) => {
    try {
      const { userId } = req.params;

      // First get the user's referral code
      const codeResult = await pool.query(
        'SELECT code FROM referrals WHERE user_id = $1',
        [userId]
      );

      if (codeResult.rows.length === 0) {
        return res.status(404).json({ message: 'Referral code not found' });
      }

      const code = codeResult.rows[0].code;

      // Get all uses of this code
      const usesResult = await pool.query(
        `
        SELECT 
          ru.*, 
          u.username, 
          u.telegram_id
        FROM 
          referral_uses ru
        JOIN 
          users u ON ru.referred_user = u.id
        WHERE 
          ru.code = $1
        ORDER BY 
          ru.used_at DESC
      `,
        [code]
      );

      res.json(usesResult.rows);
    } catch (error) {
      console.error('Error fetching referral uses:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Apply a referral code
  router.post('/apply', async (req, res) => {
    const client = await pool.connect();

    try {
      const { code, user_id } = req.body;

      if (!code || !user_id) {
        return res
          .status(400)
          .json({ message: 'Code and user ID are required' });
      }

      await client.query('BEGIN');

      // Check if code exists
      const codeResult = await client.query(
        'SELECT * FROM referrals WHERE code = $1',
        [code]
      );

      if (codeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Invalid referral code' });
      }

      const referral = codeResult.rows[0];

      // Check if user is trying to use their own code
      if (referral.user_id === user_id) {
        await client.query('ROLLBACK');
        return res
          .status(400)
          .json({ message: 'Cannot use your own referral code' });
      }

      // Check if user has already used a referral code
      const usesCheck = await client.query(
        'SELECT * FROM referral_uses WHERE referred_user = $1',
        [user_id]
      );

      if (usesCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res
          .status(400)
          .json({ message: 'User has already used a referral code' });
      }

      // Record the referral use
      const useResult = await client.query(
        'INSERT INTO referral_uses (id, code, referred_user) VALUES ($1, $2, $3) RETURNING *',
        [uuidv4(), code, user_id]
      );

      // Award bonus to the referred user
      await client.query(
        'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
        [100, user_id] // 100 Stars bonus for using a referral code
      );

      // Record transaction for referred user
      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [
          uuidv4(),
          user_id,
          100,
          'referral',
          `Bonus for using referral code ${code}`,
        ]
      );

      // Award bonus to the referrer
      await client.query(
        'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
        [20, referral.user_id] // 20 Stars bonus for the referrer
      );

      // Record transaction for referrer
      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [
          uuidv4(),
          referral.user_id,
          20,
          'referral',
          `Bonus for referral code use by user ${user_id.substring(0, 8)}...`,
        ]
      );

      await client.query('COMMIT');
      res.status(201).json({
        referral_use: useResult.rows[0],
        bonus_awarded: 100,
        referrer_bonus: 20,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error applying referral code:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });

  // Generate a new referral code for a user
  router.post('/generate', async (req, res) => {
    const client = await pool.connect();

    try {
      const { user_id } = req.body;

      if (!user_id) {
        return res.status(400).json({ message: 'User ID is required' });
      }

      await client.query('BEGIN');

      // Check if user exists
      const userCheck = await client.query(
        'SELECT username FROM users WHERE id = $1',
        [user_id]
      );

      if (userCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'User not found' });
      }

      const username = userCheck.rows[0].username;

      // Check if user already has a referral code
      const codeCheck = await client.query(
        'SELECT * FROM referrals WHERE user_id = $1',
        [user_id]
      );

      if (codeCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'User already has a referral code',
          code: codeCheck.rows[0],
        });
      }

      // Generate a new code
      const code = generateReferralCode(username);

      // Save the code
      const referralResult = await client.query(
        'INSERT INTO referrals (code, user_id, bonus_amount) VALUES ($1, $2, $3) RETURNING *',
        [code, user_id, 20]
      );

      await client.query('COMMIT');
      res.status(201).json(referralResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error generating referral code:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });

  // Helper function to generate a referral code
  function generateReferralCode(username) {
    const prefix = username.substring(0, 3).toUpperCase();
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${randomPart}`;
  }

  return router;
}
