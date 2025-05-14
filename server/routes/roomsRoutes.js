// roomsRoutes.js
// Объединённый файл с упрощёнными роутерами для standard и hero комнат

import express from 'express';
import { verifyJWT } from '../middleware/auth.js';
import roomsService from '../services/roomsCommonService.js';

export default function roomsRoutes(pool) {
  const standardService = roomsService(pool, { type: 'standard', maxPlayers: 10, organizerShare: 0 });
  const heroService = roomsService(pool, { type: 'hero', maxPlayers: 30, organizerShare: 0.05 });

  const router = express.Router();

  // История всех комнат (должна идти ДО любых '/:roomId' маршрутов)
  router.get('/history', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;
      const roomsQuery = `
        SELECT
          r.*,
          u_creator.username AS creator_username,
          u_winner.username AS winner_username,
          (SELECT COUNT(*) FROM participants WHERE room_id = r.id) AS participant_count
        FROM rooms r
        LEFT JOIN users u_creator ON r.creator_id = u_creator.id
        LEFT JOIN users u_winner ON r.winner_id = u_winner.id
        WHERE r.status = 'finished'
          AND (r.creator_id = $1 OR EXISTS (
            SELECT 1 FROM participants WHERE room_id = r.id AND user_id = $1
          ))
        ORDER BY r.finished_at DESC
        LIMIT $2 OFFSET $3
      `;
      const roomsResult = await client.query(roomsQuery, [userId, limit, offset]);
      const countResult = await client.query(`
        SELECT COUNT(*) AS total
        FROM rooms
        WHERE status = 'finished'
          AND (creator_id = $1 OR EXISTS (
            SELECT 1 FROM participants WHERE room_id = rooms.id AND user_id = $1
          ))
      `, [userId]);
      res.json({
        rooms: roomsResult.rows,
        pagination: {
          total: parseInt(countResult.rows[0].total),
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
        }
      });
    } catch (e) {
      res.status(500).json({ message: e.message });
    } finally { client.release(); }
  });

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
      const userId = req.user.id;
      const entryFee = req.body.entry_fee;

      // создаём или находим комнату (теперь возвращается и ключ)
      let roomData;
      const existing = await client.query(
        `SELECT id, room_key FROM rooms
         WHERE creator_id = $1 AND type='standard' AND status='waiting'`,
        [userId]
      );
      if (existing.rows.length) {
        roomData = { roomId: existing.rows[0].id, roomKey: existing.rows[0].room_key };
      } else {
        roomData = await standardService.createStandard(client, userId, entryFee);
      }

      // Добавляем пользователя как участника
      await standardService.join(client, roomData.roomId, userId, entryFee);

      // Получаем количество игроков в комнате
      const { rows: [{ player_count }] } = await client.query(
        `SELECT COUNT(*)::int AS player_count FROM participants WHERE room_id=$1`, [roomData.roomId]
      );

      await client.query('COMMIT');
      res.json({ roomId: roomData.roomId, player_count });
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
      const { roomId, roomKey } = await heroService.createHero(client, req.user.id, req.body.entry_fee);
      await client.query('COMMIT');
      res.status(201).json({ id: roomId, room_key: roomKey });
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
      await heroService.validateRoomStatus(client, req.body.room_key);
      const { participant, room } = await heroService.joinByKey(
        client,
        req.body.room_key,
        req.user.id,
        req.body.entry_fee
      );

      // собрать всех участников сразу с photo_url
      const participants = await client.query(`
        SELECT u.id, u.username, u.photo_url, p.joined_at
        FROM participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.room_id = $1
        ORDER BY p.joined_at ASC
      `, [room.id]);

      await client.query('COMMIT');
      res.json({
        participant,
        room,
        participants: participants.rows
      });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: e.message });
    } finally { client.release(); }
  });

  // Observe
  hero.get('/:roomId/observe', verifyJWT(), async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await heroService.validateRoomStatus(client, req.params.roomId);

      const room = await client.query(`
        SELECT * FROM rooms WHERE id = $1
      `, [req.params.roomId]);

      const participants = await client.query(`
        SELECT u.id, u.username, u.photo_url, p.joined_at
        FROM participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.room_id = $1
        ORDER BY p.joined_at ASC
      `, [req.params.roomId]);

      await client.query('COMMIT');
      res.json({
        room: room.rows[0],
        participants: participants.rows
      });
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
