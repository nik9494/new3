// roomsRoutes.js
// Объединённый файл с упрощёнными роутерами для standard и hero комнат

import express from 'express';
import { verifyJWT } from '../middleware/auth.js';
import roomsService from '../services/roomsCommonService.js';

export default function roomsRoutes(pool) {
  const standardService = roomsService(pool, { type: 'standard', maxPlayers: 10, organizerShare: 0 });
  const heroService = roomsService(pool, { type: 'hero', maxPlayers: 30, organizerShare: 0.05 });

  const router = express.Router();

  // --- Standard Rooms ---
  const standard = express.Router();

  // List waiting standard rooms
  standard.get('/', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      const { rows } = await client.query(
        `SELECT r.*, COUNT(p.id) AS player_count FROM rooms r
         LEFT JOIN participants p ON p.room_id = r.id
         WHERE r.type='standard' AND r.status='waiting'
         GROUP BY r.id`
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    } finally { client.release(); }
  });

  // Join or create
  standard.post('/join', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const id = req.user.id;
      const { entry_fee } = req.body;
      let roomId;
      try {
        roomId = await standardService.join(client, existingRoomId, id, entry_fee);
      } catch {
        roomId = await standardService.create(client, id, entry_fee);
      }
      await client.query('COMMIT');
      res.json({ roomId });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message });
    } finally { client.release(); }
  });

  // Start
  standard.post('/:roomId/start', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await standardService.start(client, req.params.roomId);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message });
    } finally { client.release(); }
  });

  // Finish
  standard.post('/:roomId/finish', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await standardService.finish(client, req.params.roomId, req.body.winner_id);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message });
    } finally { client.release(); }
  });

  // --- Hero Rooms ---
  const hero = express.Router();

  // Create
  hero.post('/', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const roomId = await heroService.create(client, req.user.id, req.body.entry_fee);
      await client.query('COMMIT');
      res.status(201).json({ roomId });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message });
    } finally { client.release(); }
  });

  // Join by key
  hero.post('/join-by-key', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { participant } = await heroService.joinByKey(
        client,
        req.body.room_key,
        req.user.id,
        req.body.entry_fee
      );
      await client.query('COMMIT');
      res.json(participant);
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message });
    } finally { client.release(); }
  });

  // Start (organizer)
  hero.post('/:roomId/start', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await heroService.start(client, req.params.roomId);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message });
    } finally { client.release(); }
  });

  // Finish (organizer)
  hero.post('/:roomId/finish', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await heroService.finish(client, req.params.roomId, req.body.winner_id);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message });
    } finally { client.release(); }
  });

  // Mount sub-routers
  router.use('/standard', standard);
  router.use('/hero', hero);

  return router;
}

// roomsCommonService.js
export default function roomsService(pool, config) {
  // ... existing code ...

  async function joinByKey(client, roomKey, userId, entryFee) {
    const roomRes = await client.query(
      `SELECT id, entry_fee FROM rooms WHERE room_key = $1 AND status='waiting'`,
      [roomKey]
    );

    if (roomRes.rows.length === 0) {
      throw new Error('Room not found or not available');
    }

    const room = roomRes.rows[0];
    if (room.entry_fee !== entryFee) {
      throw new Error('Entry fee does not match');
    }

    return this.join(client, room.id, userId, entryFee);
  }

  return {
    refundParticipants,
    cleanupExpired: cleanupExpired,
    create,
    join,
    joinByKey, // Add the new method to the returned object
    start,
    finish,
  };
}
