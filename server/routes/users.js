import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { verifyJWT, generateToken, apiRateLimit } from '../middleware/auth.js';

export default function usersRoutes(pool) {
  if (!pool) {
    throw new Error('Database pool is required for users routes');
  }

  const router = express.Router();

  // Apply rate limiting to all user routes (15 минут, макс. 100 запросов)
  router.use(
    apiRateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    })
  );

  // Initialize user from Telegram Mini App
  router.post('/init', async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const { telegram_id, username, photo_url, first_name, last_name } =
        req.body;

      if (!telegram_id) {
        console.error('Init user failed: Telegram ID is required');
        return res.status(400).json({ message: 'Telegram ID is required' });
      }

      // Ensure telegram_id is a number
      const telegramId = Number(telegram_id);
      if (isNaN(telegramId)) {
        console.error('Init user failed: Invalid Telegram ID format');
        return res.status(400).json({ message: 'Invalid Telegram ID format' });
      }

      console.log('Initializing user with data:', {
        telegram_id: telegramId,
        username,
        first_name,
        last_name,
        photo_url,
      });

      // Отключаем RLS для этой транзакции
      await client.query('SET LOCAL row_security = off');

      // Check if user exists
      const userCheck = await client.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramId]
      );

      let user;

      if (userCheck.rows.length > 0) {
        // User exists, update user data if needed
        console.log('User exists, updating data if needed:', userCheck.rows[0]);

        const updateFields = [];
        const updateValues = [];
        let paramCount = 1;

        if (username && username !== userCheck.rows[0].username) {
          updateFields.push(`username = $${paramCount}`);
          updateValues.push(username);
          paramCount++;
        }

        if (updateFields.length > 0) {
          const updateResult = await client.query(
            `UPDATE users SET ${updateFields.join(', ')} WHERE telegram_id = $${paramCount} RETURNING *`,
            [...updateValues, telegramId]
          );
          user = updateResult.rows[0];
          console.log('User data updated:', user);
        } else {
          user = userCheck.rows[0];
        }
      } else {
        // Create new user with 0 balance
        console.log('Creating new user');
        const displayName =
          username ||
          first_name ||
          `User_${telegramId.toString().substring(0, 6)}`;

        const insertResult = await client.query(
          'INSERT INTO users (id, telegram_id, username, balance_stars, has_ton_wallet) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [uuidv4(), telegramId, displayName, 0, false]
        );

        user = insertResult.rows[0];
        console.log('New user created:', user);

        // Generate referral code for new user
        const referralCode = generateReferralCode(displayName);
        await client.query(
          'INSERT INTO referrals (code, user_id, bonus_amount) VALUES ($1, $2, $3)',
          [referralCode, user.id, 20]
        );
        console.log('Referral code generated:', referralCode);
      }

      await client.query('COMMIT');

      // Set current user for RLS
      await client.query('SELECT set_current_user_id($1)', [user.id]);

      // Generate JWT token
      const token = generateToken(user);
      console.log('JWT token generated for user:', user.id);

      // Return user data with token
      res.status(200).json({
        success: true,
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          balance_stars: user.balance_stars,
          has_ton_wallet: user.has_ton_wallet,
        },
        token,
      });
    } catch (error) {
      if (client) await client.query('ROLLBACK');
      console.error('Error initializing user:', error);
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message,
        details:
          process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    } finally {
      if (client) client.release();
    }
  });

  // Get current user profile (requires authentication)
  router.get('/me', verifyJWT(), async (req, res) => {
    try {
      const userId = req.user.id;

      // Get user data
      const userResult = await pool.query(
        'SELECT id, username, telegram_id, balance_stars, has_ton_wallet FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user = userResult.rows[0];

      // Get wallet data if user has one
      let wallet = null;
      if (user.has_ton_wallet) {
        const walletResult = await pool.query(
          'SELECT ton_address FROM wallets WHERE user_id = $1',
          [userId]
        );

        if (walletResult.rows.length > 0) {
          wallet = walletResult.rows[0].ton_address;
        }
      }

      res.json({
        id: user.id,
        username: user.username,
        telegram_id: user.telegram_id,
        balance_stars: user.balance_stars,
        has_ton_wallet: user.has_ton_wallet,
        wallet,
      });
    } catch (error) {
      console.error('Error fetching current user:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Get user by Telegram ID
  router.get('/telegram/:telegramId', async (req, res) => {
    const telegramIdNum = Number(req.params.telegramId);
    if (isNaN(telegramIdNum)) {
      return res
        .status(400)
        .json({ success: false, message: 'Неверный формат Telegram ID' });
    }

    let client;
    try {
      client = await pool.connect();

      // Начинаем транзакцию и отключаем RLS
      await client.query('BEGIN');
      await client.query('SET LOCAL row_security = off');

      // 1) SELECT users
      const userRes = await client.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramIdNum]
      );
      if (userRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res
          .status(404)
          .json({ success: false, message: 'Пользователь не найден' });
      }
      const user = userRes.rows[0];

      // 2) wallets
      const walletRes = await client.query(
        'SELECT ton_address FROM wallets WHERE user_id = $1',
        [user.id]
      );
      const wallet = walletRes.rows[0]?.ton_address || null;

      // 3) stats (желательно тут вызвать готовую функцию get_user_stats)
      const statsRes = await client.query('SELECT * FROM get_user_stats($1)', [
        user.id,
      ]);
      const stats = statsRes.rows[0];

      // 4) referrals и referral_uses
      const referralRes = await client.query(
        'SELECT code FROM referrals WHERE user_id = $1',
        [user.id]
      );
      const code = referralRes.rows[0]?.code || null;
      const usesRes = await client.query(
        `SELECT u.username, ru.used_at,
                COUNT(DISTINCT p.room_id)   AS games_played,
                COALESCE(SUM(t.amount),0)    AS bonus_earned
         FROM referral_uses ru
         JOIN referrals r ON ru.code = r.code
         JOIN users u       ON ru.referred_user = u.id
         LEFT JOIN participants p ON p.user_id = ru.referred_user
         LEFT JOIN transactions t ON t.user_id = $1 AND t.type = 'referral'
         WHERE r.user_id = $1
         GROUP BY u.username, ru.used_at
         ORDER BY ru.used_at DESC`,
        [user.id]
      );

      await client.query('COMMIT');

      // Генерируем токен и отправляем ответ
      const token = generateToken(user);
      res.setHeader('X-Auth-Token', token);
      return res.json({
        success: true,
        data: { user, wallet, stats, referral: { code, uses: usesRes.rows } },
        token,
      });
    } catch (err) {
      if (client) await client.query('ROLLBACK');
      console.error('Ошибка при получении пользователя:', err);
      return res
        .status(500)
        .json({
          success: false,
          message: 'Ошибка сервера',
          error: err.message,
        });
    } finally {
      if (client) client.release();
    }
  });

  // Create or update user
  router.post('/', async (req, res) => {
    try {
      const { telegram_id, username, photo_url } = req.body;

      if (!telegram_id || !username) {
        return res
          .status(400)
          .json({ message: 'Telegram ID and username are required' });
      }

      // Check if user exists
      const userCheck = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegram_id]
      );

      let user;

      if (userCheck.rows.length > 0) {
        // Update existing user
        const updateResult = await pool.query(
          'UPDATE users SET username = $1 WHERE telegram_id = $2 RETURNING *',
          [username, telegram_id]
        );
        user = updateResult.rows[0];
      } else {
        // Create new user
        const insertResult = await pool.query(
          'INSERT INTO users (id, telegram_id, username, balance_stars) VALUES ($1, $2, $3, $4) RETURNING *',
          [uuidv4(), telegram_id, username, 100] // Start with 100 Stars
        );
        user = insertResult.rows[0];

        // Generate referral code for new user
        const referralCode = generateReferralCode(username);
        await pool.query(
          'INSERT INTO referrals (code, user_id, bonus_amount) VALUES ($1, $2, $3)',
          [referralCode, user.id, 20]
        );
      }

      res.status(201).json(user);
    } catch (error) {
      console.error('Error creating/updating user:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Get user profile with stats (requires authentication)
  router.get('/:userId', verifyJWT(), async (req, res) => {
    try {
      const { userId } = req.params;

      // Security check: users can only access their own profile unless they're admins
      if (userId !== req.user.id && !req.user.isAdmin) {
        return res.status(403).json({ message: 'Access denied' });
      }

      // Get user data
      const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [
        userId,
      ]);

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user = userResult.rows[0];

      // Get wallet data
      const walletResult = await pool.query(
        'SELECT ton_address FROM wallets WHERE user_id = $1',
        [userId]
      );

      const wallet = walletResult.rows.length > 0 ? walletResult.rows[0] : null;

      // Get user stats
      const statsResult = await pool.query(
        `
        SELECT
          COUNT(DISTINCT p.room_id) as games_played,
          COUNT(DISTINCT CASE WHEN g.winner_id = $1 THEN g.id END) as games_won,
          COALESCE(SUM(CASE WHEN t.type = 'payout' THEN t.amount ELSE 0 END), 0) as total_earned
        FROM
          participants p
        LEFT JOIN
          games g ON p.room_id = g.room_id
        LEFT JOIN
          transactions t ON t.user_id = $1
        WHERE
          p.user_id = $1
      `,
        [userId]
      );

      const stats = statsResult.rows[0];
      stats.win_rate =
        stats.games_played > 0
          ? Math.round((stats.games_won / stats.games_played) * 100)
          : 0;

      // Get referral data
      const referralResult = await pool.query(
        'SELECT code FROM referrals WHERE user_id = $1',
        [userId]
      );

      const referralCode =
        referralResult.rows.length > 0 ? referralResult.rows[0].code : null;

      // Get referral uses
      const referralUsesResult = await pool.query(
        `
        SELECT
          u.username,
          ru.used_at,
          COUNT(DISTINCT p.room_id) as games_played,
          COALESCE(SUM(t.amount), 0) as bonus_earned
        FROM
          referral_uses ru
        JOIN
          referrals r ON ru.code = r.code
        JOIN
          users u ON ru.referred_user = u.id
        LEFT JOIN
          participants p ON p.user_id = ru.referred_user
        LEFT JOIN
          transactions t ON t.user_id = $1 AND t.type = 'referral'
        WHERE
          r.user_id = $1
        GROUP BY
          u.username, ru.used_at
        ORDER BY
          ru.used_at DESC
      `,
        [userId]
      );

      // Combine all data
      const profile = {
        user,
        wallet: wallet ? wallet.ton_address : null,
        stats,
        referral: {
          code: referralCode,
          uses: referralUsesResult.rows,
        },
      };

      res.json(profile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Connect TON wallet (requires authentication)
  router.post('/:userId/wallet', verifyJWT(), async (req, res) => {
    try {
      const { userId } = req.params;
      const { ton_address } = req.body;

      // Security check: users can only modify their own wallet
      if (userId !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }

      if (!ton_address) {
        return res.status(400).json({ message: 'TON address is required' });
      }

      // Validate TON address format
      const tonAddressRegex = /^[a-zA-Z0-9_-]{48}$/;
      if (!tonAddressRegex.test(ton_address)) {
        return res.status(400).json({ message: 'Invalid TON address format' });
      }

      // Check if user exists
      const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [
        userId,
      ]);

      if (userCheck.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Check if wallet already exists
      const walletCheck = await pool.query(
        'SELECT * FROM wallets WHERE user_id = $1',
        [userId]
      );

      let wallet;

      if (walletCheck.rows.length > 0) {
        // Update existing wallet
        const updateResult = await pool.query(
          'UPDATE wallets SET ton_address = $1 WHERE user_id = $2 RETURNING *',
          [ton_address, userId]
        );
        wallet = updateResult.rows[0];
      } else {
        // Create new wallet
        const insertResult = await pool.query(
          'INSERT INTO wallets (id, user_id, ton_address) VALUES ($1, $2, $3) RETURNING *',
          [uuidv4(), userId, ton_address]
        );
        wallet = insertResult.rows[0];
      }

      // Update user has_ton_wallet flag
      await pool.query('UPDATE users SET has_ton_wallet = true WHERE id = $1', [
        userId,
      ]);

      res.status(201).json(wallet);
    } catch (error) {
      console.error('Error connecting wallet:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Helper function to generate referral code
  function generateReferralCode(username) {
    const prefix = username.substring(0, 3).toUpperCase();
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${randomPart}`;
  }

  return router;
}
