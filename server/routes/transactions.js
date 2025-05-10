import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function transactionsRoutes(pool) {
  const router = express.Router();

  // Get transactions for a user
  router.get('/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      const result = await pool.query(
        'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [userId, limit, offset]
      );

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Create a transaction (for admin or payment processing)
  router.post('/', async (req, res) => {
    try {
      const { user_id, amount, type, description } = req.body;

      if (!user_id || !amount || !type) {
        return res.status(400).json({
          message: 'User ID, amount, and type are required',
        });
      }

      // Check if user exists
      const userCheck = await pool.query('SELECT * FROM users WHERE id = $1', [
        user_id,
      ]);

      if (userCheck.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      // Create transaction
      const transactionResult = await pool.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [uuidv4(), user_id, amount, type, description || `${type} transaction`]
      );

      // Update user balance based on transaction type
      if (type === 'payout' || type === 'referral') {
        // Add to balance
        await pool.query(
          'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
          [amount, user_id]
        );
      } else if (type === 'entry' || type === 'fee') {
        // Subtract from balance
        await pool.query(
          'UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2',
          [amount, user_id]
        );
      }

      res.status(201).json(transactionResult.rows[0]);
    } catch (error) {
      console.error('Error creating transaction:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Process Telegram payment
  router.post('/telegram-payment', async (req, res) => {
    try {
      const { telegram_id, amount, payment_id } = req.body;

      if (!telegram_id || !amount || !payment_id) {
        return res.status(400).json({
          message: 'Telegram ID, amount, and payment ID are required',
        });
      }

      // Find user by Telegram ID
      const userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegram_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user = userResult.rows[0];

      // Check if payment was already processed
      const paymentCheck = await pool.query(
        'SELECT * FROM transactions WHERE description LIKE $1',
        [`%${payment_id}%`]
      );

      if (paymentCheck.rows.length > 0) {
        return res.status(400).json({ message: 'Payment already processed' });
      }

      // Add Stars to user balance
      await pool.query(
        'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
        [amount, user.id]
      );

      // Record transaction
      const transactionResult = await pool.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [uuidv4(), user.id, amount, 'payout', `Telegram payment ${payment_id}`]
      );

      res.status(201).json({
        transaction: transactionResult.rows[0],
        new_balance: parseFloat(user.balance_stars) + parseFloat(amount),
      });
    } catch (error) {
      console.error('Error processing Telegram payment:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Process TON withdrawal
  router.post('/withdraw-ton', async (req, res) => {
    try {
      const { user_id, amount } = req.body;

      if (!user_id || !amount) {
        return res.status(400).json({
          message: 'User ID and amount are required',
        });
      }

      // Check if user exists and has enough balance
      const userResult = await pool.query(
        'SELECT balance_stars, has_ton_wallet FROM users WHERE id = $1',
        [user_id]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      const user = userResult.rows[0];

      if (!user.has_ton_wallet) {
        return res
          .status(400)
          .json({ message: 'User does not have a TON wallet' });
      }

      if (parseFloat(user.balance_stars) < parseFloat(amount)) {
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      // Get wallet address
      const walletResult = await pool.query(
        'SELECT ton_address FROM wallets WHERE user_id = $1',
        [user_id]
      );

      if (walletResult.rows.length === 0) {
        return res.status(400).json({ message: 'Wallet not found' });
      }

      const wallet = walletResult.rows[0];

      // Deduct Stars from user balance
      await pool.query(
        'UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2',
        [amount, user_id]
      );

      // Record transaction
      const transactionResult = await pool.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [
          uuidv4(),
          user_id,
          amount,
          'fee',
          `Withdrawal to TON wallet ${wallet.ton_address.substring(0, 8)}...`,
        ]
      );

      // In a real implementation, you would initiate a TON transfer here
      // This would involve calling a TON wallet API or service

      res.status(201).json({
        transaction: transactionResult.rows[0],
        new_balance: parseFloat(user.balance_stars) - parseFloat(amount),
        wallet_address: wallet.ton_address,
      });
    } catch (error) {
      console.error('Error processing TON withdrawal:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  return router;
}
