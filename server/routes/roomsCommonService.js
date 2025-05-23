import { v4 as uuidv4 } from 'uuid';

export default function roomsService(pool, config) {
  const { type, maxPlayers, organizerShare = 0 } = config;

  // Генерация уникального ключа комнаты
  async function generateUniqueRoomKey(client) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let roomKey;
    let isUnique = false;

    while (!isUnique) {
      roomKey = Array.from({ length: 6 })
        .map(() => characters.charAt(Math.floor(Math.random() * characters.length)))
        .join('');

      // Проверка уникальности ключа
      const { rows } = await client.query(
        `SELECT COUNT(*) FROM rooms WHERE room_key = $1`,
        [roomKey]
      );

      isUnique = parseInt(rows[0].count, 10) === 0;
    }

    return roomKey;
  }

  async function refundParticipants(client, roomId, entryFee) {
    await client.query(
      `UPDATE users u
       SET balance_stars = balance_stars + $1
       FROM participants p
       WHERE p.room_id = $2::uuid AND u.id = p.user_id`,
      [entryFee, roomId]
    );
    await client.query(
      `INSERT INTO transactions (id, user_id, amount, type, description)
       SELECT gen_random_uuid(), p.user_id, $1, 'payout',
              'Refund for room ' || $2
        FROM participants p
       WHERE p.room_id = $2::uuid`,
      [entryFee, roomId]
    );
  }

  async function cleanupExpired(client) {
    const { rows } = await client.query(
      `SELECT id, entry_fee FROM rooms
       WHERE type = $1 AND status = 'waiting'
         AND created_at < NOW() - INTERVAL '5 minutes'`,
      [type]
    );
    for (const r of rows) {
      await refundParticipants(client, r.id, r.entry_fee);
      await client.query(`DELETE FROM rooms WHERE id = $1`, [r.id]);
    }
    return rows.length;
  }

  // Для стандартных комнат
  async function createStandard(client, creatorId, entryFee) {
    const roomId = uuidv4();
    const roomKey = await generateUniqueRoomKey(client); // Генерация ключа
    await client.query(
      `INSERT INTO rooms
       (id, creator_id, type, entry_fee, max_players, status, room_key, created_at)
       VALUES ($1, $2, 'standard', $3, $4, 'waiting', $5, NOW())`,
      [roomId, creatorId, entryFee, maxPlayers, roomKey]
    );
    return { roomId, roomKey }; // Возвращаем ключ вместе с ID
  }

  // Для Hero-комнат
  async function createHero(client, creatorId, entryFee) {
    const roomId = uuidv4();
    // Генерация ключа (6 символов)
    const roomKey = await generateUniqueRoomKey(client);
    await client.query(
      `INSERT INTO rooms
       (id, creator_id, type, entry_fee, max_players, status, room_key, created_at)
       VALUES ($1, $2, 'hero', $3, $4, 'waiting', $5, NOW())`,
      [roomId, creatorId, entryFee, maxPlayers, roomKey]
    );
    return { roomId, roomKey };
  }

  async function join(client, roomId, userId, entryFee) {
    // Снимаем звезды у пользователя
    await client.query(
      `UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2`,
      [entryFee, userId]
    );
    
    // Добавляем пользователя в участники
    const participantId = uuidv4();
    await client.query(
      `INSERT INTO participants (id, room_id, user_id, joined_at)
       VALUES ($1, $2, $3, NOW())`,
      [participantId, roomId, userId]
    );
    
    // Получаем данные участника для возврата
    const participantResult = await client.query(
      `SELECT p.*, u.username, u.photo_url 
       FROM participants p
       JOIN users u ON p.user_id = u.id
       WHERE p.id = $1`,
      [participantId]
    );
    
    return participantResult.rows[0];
  }

  async function joinByKey(client, roomKey, userId, entryFee) {
    // Находим комнату по ключу
    const roomRes = await client.query(
      `SELECT * FROM rooms WHERE room_key = $1 AND status='waiting'`,
      [roomKey]
    );
    
    if (!roomRes.rows.length) throw new Error('Комната не найдена или недоступна');
    const room = roomRes.rows[0];
    
    if (parseFloat(room.entry_fee) !== entryFee) throw new Error('Несоответствие entry_fee');
    
    // Добавляем пользователя в комнату
    const participant = await join(client, room.id, userId, entryFee);
    
    // Возвращаем и участника, и данные комнаты
    return { participant, room };
  }

  async function validateRoomStatus(client, roomIdOrKey) {
    // Проверка существования комнаты и её статуса
    const isKey = typeof roomIdOrKey === 'string' && roomIdOrKey.length <= 6;
    const query = isKey 
      ? `SELECT id, status FROM rooms WHERE room_key = $1`
      : `SELECT id, status FROM rooms WHERE id = $1`;
    
    const { rows } = await client.query(query, [roomIdOrKey]);
    
    if (!rows.length) {
      throw new Error('Комната не найдена');
    }
    
    if (rows[0].status !== 'waiting') {
      throw new Error('Комната недоступна для присоединения');
    }
    
    return rows[0].id;
  }

  async function start(client, roomId) {
    await client.query(
      `UPDATE rooms SET status = 'active', started_at = NOW() WHERE id = $1`,
      [roomId]
    );
  }

  async function finish(client, roomId, winnerId) {
    // count participants
    const countRes = await client.query(
      `SELECT COUNT(*) FROM participants WHERE room_id = $1`,
      [roomId]
    );
    const total = parseInt(countRes.rows[0].count, 10);
    const entryFeeRes = await client.query(`SELECT entry_fee FROM rooms WHERE id = $1`, [roomId]);
    const bank = total * parseFloat(entryFeeRes.rows[0].entry_fee);
    const winnerShare = bank * (1 - organizerShare);
    const orgShare = bank * organizerShare;
    await client.query(`UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2`, [winnerShare, winnerId]);
    if (organizerShare > 0) {
      const creatorRes = await client.query(`SELECT creator_id FROM rooms WHERE id = $1`, [roomId]);
      await client.query(`UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2`, [orgShare, creatorRes.rows[0].creator_id]);
    }
    await client.query(`UPDATE rooms SET status = 'finished', finished_at = NOW(), winner_id = $1 WHERE id = $2`, [winnerId, roomId]);
  }

  return {
    refundParticipants,
    cleanupExpired,
    createStandard,
    createHero,
    join,
    joinByKey,
    validateRoomStatus, // Добавляем в экспорт
    start,
    finish,
  };
}