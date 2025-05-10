import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function roomsRoutes(pool) {
  const router = express.Router();

  // Cleanup expired hero rooms (would be called by a cron job in production)
  router.post('/cleanup-expired', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Find expired hero rooms
      const expiredRoomsResult = await client.query(
        `SELECT id, creator_id, entry_fee FROM rooms 
         WHERE type = 'hero' 
         AND status = 'waiting' 
         AND created_at < NOW() - INTERVAL '10 minutes'`
      );

      const expiredRooms = expiredRoomsResult.rows;

      // For each expired room, refund participants and mark as expired
      for (const room of expiredRooms) {
        // Get participants
        const participantsResult = await client.query(
          'SELECT user_id FROM participants WHERE room_id = $1',
          [room.id]
        );

        // Refund each participant
        for (const participant of participantsResult.rows) {
          // Return entry fee
          await client.query(
            'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
            [room.entry_fee, participant.user_id]
          );

          // Record refund transaction
          await client.query(
            'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
            [
              uuidv4(),
              participant.user_id,
              room.entry_fee,
              'payout',
              `Refund for expired hero room ${room.id}`,
            ]
          );
        }

        // Mark room as expired
        await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
          'expired',
          room.id,
        ]);
      }

      await client.query('COMMIT');
      res.json({ message: `${expiredRooms.length} expired rooms processed` });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error cleaning up expired rooms:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });

  // Get all available rooms
  router.get('/', async (req, res) => {
    try {
      // Clean up expired hero rooms first
      await pool.query(`
        UPDATE rooms 
        SET status = 'expired' 
        WHERE type = 'hero' 
        AND status = 'waiting' 
        AND created_at < NOW() - INTERVAL '10 minutes'
      `);

      // Get all active rooms
      const result = await pool.query(`
        SELECT 
          r.*, 
          COUNT(p.id) as player_count
        FROM 
          rooms r
        LEFT JOIN 
          participants p ON r.id = p.room_id
        WHERE 
          r.status = 'waiting'
        GROUP BY 
          r.id
        ORDER BY 
          r.type DESC, r.entry_fee ASC
      `);

      res.json(result.rows);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Get room by ID with participants
  router.get('/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;

      // Get room data
      const roomResult = await pool.query('SELECT * FROM rooms WHERE id = $1', [
        roomId,
      ]);

      if (roomResult.rows.length === 0) {
        return res.status(404).json({ message: 'Room not found' });
      }

      const room = roomResult.rows[0];

      // Get participants
      const participantsResult = await pool.query(
        `
        SELECT 
          p.id, p.joined_at, 
          u.id as user_id, u.username, u.telegram_id
        FROM 
          participants p
        JOIN 
          users u ON p.user_id = u.id
        WHERE 
          p.room_id = $1
        ORDER BY 
          p.joined_at ASC
      `,
        [roomId]
      );

      // Combine data
      const roomData = {
        ...room,
        participants: participantsResult.rows,
      };

      res.json(roomData);
    } catch (error) {
      console.error('Error fetching room:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  });

  // Generate a random room key (6 characters)
  function generateRoomKey() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length)
      );
    }
    return result;
  }

  // Create a new room
  router.post('/', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { creator_id, type, entry_fee, max_players = 10 } = req.body;

      if (!creator_id || !type || !entry_fee) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Creator ID, type, and entry fee are required',
        });
      }

      // For hero rooms, check if the creator already has an open room
      if (type === 'hero') {
        const existingRoomCheck = await client.query(
          'SELECT * FROM rooms WHERE creator_id = $1 AND (status = $2 OR status = $3)',
          [creator_id, 'waiting', 'active']
        );

        if (existingRoomCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            message: 'У вас уже есть открытая комната',
            room: existingRoomCheck.rows[0],
          });
        }
      }

      // Check if user exists and has enough balance
      const userCheck = await client.query(
        'SELECT balance_stars FROM users WHERE id = $1',
        [creator_id]
      );

      if (userCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'User not found' });
      }

      const userBalance = parseFloat(userCheck.rows[0].balance_stars);
      const roomFee = parseFloat(entry_fee);

      if (userBalance < roomFee) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      // Create room with room key for hero rooms
      const roomId = uuidv4();
      const roomKey = type === 'hero' ? generateRoomKey() : null;
      const actualMaxPlayers = type === 'hero' ? 30 : max_players;

      const roomResult = await client.query(
        'INSERT INTO rooms (id, creator_id, type, entry_fee, max_players, status, room_key, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *',
        [
          roomId,
          creator_id,
          type,
          roomFee,
          actualMaxPlayers,
          'waiting',
          roomKey,
        ]
      );

      // Deduct entry fee from creator
      await client.query(
        'UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2',
        [roomFee, creator_id]
      );

      // Record transaction
      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [
          uuidv4(),
          creator_id,
          roomFee,
          'entry',
          `Entry fee for ${type} room ${roomId}`,
        ]
      );

      // Add creator as first participant
      await client.query(
        'INSERT INTO participants (id, room_id, user_id) VALUES ($1, $2, $3)',
        [uuidv4(), roomId, creator_id]
      );

      await client.query('COMMIT');
      res.status(201).json(roomResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating room:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });

  // Join a room by ID
  router.post('/:roomId/join', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { roomId } = req.params;
      const { user_id } = req.body;

      if (!user_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'User ID is required' });
      }

      // Check if room exists and is in waiting status
      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE id = $1 AND status = $2',
        [roomId, 'waiting']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res
          .status(404)
          .json({ message: 'Room not found or not in waiting status' });
      }

      const room = roomCheck.rows[0];

      // For hero rooms, check if the room hasn't expired
      if (room.type === 'hero') {
        const createdAt = new Date(room.created_at);
        const now = new Date();
        const timeDiffMinutes = (now - createdAt) / (1000 * 60);

        if (timeDiffMinutes > 10) {
          await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
            'expired',
            roomId,
          ]);
          await client.query('ROLLBACK');
          return res.status(410).json({
            message:
              'Организатор не запустил игру вовремя. Свяжитесь с организатором или введите другой ключ.',
          });
        }
      }

      // Check if user exists and has enough balance
      const userCheck = await client.query(
        'SELECT balance_stars FROM users WHERE id = $1',
        [user_id]
      );

      if (userCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'User not found' });
      }

      const userBalance = parseFloat(userCheck.rows[0].balance_stars);
      const roomFee = parseFloat(room.entry_fee);

      if (userBalance < roomFee) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      // Check if user is already in the room
      const participantCheck = await client.query(
        'SELECT * FROM participants WHERE room_id = $1 AND user_id = $2',
        [roomId, user_id]
      );

      if (participantCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'User already in room' });
      }

      // Check if room is full
      const participantCount = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [roomId]
      );

      if (parseInt(participantCount.rows[0].count) >= room.max_players) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Room is full' });
      }

      // Deduct entry fee
      await client.query(
        'UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2',
        [roomFee, user_id]
      );

      // Record transaction
      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [
          uuidv4(),
          user_id,
          roomFee,
          'entry',
          `Entry fee for ${room.type} room ${roomId}`,
        ]
      );

      // Add user as participant
      const participantResult = await client.query(
        'INSERT INTO participants (id, room_id, user_id) VALUES ($1, $2, $3) RETURNING *',
        [uuidv4(), roomId, user_id]
      );

      // Check if room is now full and should start
      const newParticipantCount = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [roomId]
      );

      if (parseInt(newParticipantCount.rows[0].count) >= room.max_players) {
        // Update room status to active
        await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
          'active',
          roomId,
        ]);

        // Create a new game
        await client.query('INSERT INTO games (id, room_id) VALUES ($1, $2)', [
          uuidv4(),
          roomId,
        ]);
      }

      await client.query('COMMIT');
      res.status(201).json(participantResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error joining room:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });

  // Join a room by room key
  router.post('/join-by-key', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { room_key, user_id } = req.body;

      if (!room_key || !user_id) {
        await client.query('ROLLBACK');
        return res
          .status(400)
          .json({ message: 'Room key and user ID are required' });
      }

      // Check if room exists and is in waiting status
      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE room_key = $1 AND status = $2 AND type = $3',
        [room_key, 'waiting', 'hero']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res
          .status(404)
          .json({ message: 'Room not found or not in waiting status' });
      }

      const room = roomCheck.rows[0];

      // Check if the room hasn't expired
      const createdAt = new Date(room.created_at);
      const now = new Date();
      const timeDiffMinutes = (now - createdAt) / (1000 * 60);

      if (timeDiffMinutes > 10) {
        await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
          'expired',
          room.id,
        ]);
        await client.query('ROLLBACK');
        return res.status(410).json({
          message:
            'Организатор не запустил игру вовремя. Свяжитесь с организатором или введите другой ключ.',
        });
      }

      // Check if user exists and has enough balance
      const userCheck = await client.query(
        'SELECT balance_stars FROM users WHERE id = $1',
        [user_id]
      );

      if (userCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'User not found' });
      }

      const userBalance = parseFloat(userCheck.rows[0].balance_stars);
      const roomFee = parseFloat(room.entry_fee);

      if (userBalance < roomFee) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      // Check if user is already in the room
      const participantCheck = await client.query(
        'SELECT * FROM participants WHERE room_id = $1 AND user_id = $2',
        [room.id, user_id]
      );

      if (participantCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'User already in room' });
      }

      // Check if room is full
      const participantCount = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [room.id]
      );

      if (parseInt(participantCount.rows[0].count) >= room.max_players) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Room is full' });
      }

      // Deduct entry fee
      await client.query(
        'UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2',
        [roomFee, user_id]
      );

      // Record transaction
      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [
          uuidv4(),
          user_id,
          roomFee,
          'entry',
          `Entry fee for hero room ${room.id}`,
        ]
      );

      // Add user as participant
      const participantResult = await client.query(
        'INSERT INTO participants (id, room_id, user_id) VALUES ($1, $2, $3) RETURNING *',
        [uuidv4(), room.id, user_id]
      );

      await client.query('COMMIT');
      res.status(201).json({
        participant: participantResult.rows[0],
        room: room,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error joining room by key:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });

  // Start a game in a room
  router.post('/:roomId/start', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { roomId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'User ID is required' });
      }

      // Check if room exists and is in waiting status
      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE id = $1 AND status = $2',
        [roomId, 'waiting']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res
          .status(404)
          .json({ message: 'Room not found or not in waiting status' });
      }

      const room = roomCheck.rows[0];

      // Check if user is the creator of the room
      if (room.creator_id !== userId) {
        await client.query('ROLLBACK');
        return res
          .status(403)
          .json({ message: 'Only the room creator can start the game' });
      }

      // Update room status to active
      await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
        'active',
        roomId,
      ]);

      // Create a new game
      const gameId = uuidv4();
      await client.query(
        'INSERT INTO games (id, room_id, start_time) VALUES ($1, $2, NOW())',
        [gameId, roomId]
      );

      await client.query('COMMIT');
      res.json({
        message: 'Game started successfully',
        gameId: gameId,
        roomId: roomId,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error starting game:', error);
      res.status(500).json({ message: 'Server error', error: error.message });
    } finally {
      client.release();
    }
  });

  return router;
}
