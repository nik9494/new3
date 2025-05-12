import express from 'express';
import { v4 as uuidv4 } from 'uuid';

export default function roomsRoutes(pool) {
  const router = express.Router();

  // Генерирует и проверяет уникальность ключа комнаты
  async function generateUniqueRoomKey(client) {
    let isUnique = false;
    let roomKey;
    
    while (!isUnique) {
      roomKey = generateRandomKey();
      
      // Проверяем наличие ключа в БД
      const keyCheck = await client.query(
        'SELECT EXISTS(SELECT 1 FROM rooms WHERE room_key = $1)',
        [roomKey]
      );
      
      isUnique = !keyCheck.rows[0].exists;
    }
    
    return roomKey;
  }

  function generateRandomKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Функция для обработки истекших Hero-комнат
  async function cleanupExpiredRooms(client) {
    try {
      // Находим просроченные Hero-комнаты
      const expiredRoomsResult = await client.query(`
        SELECT id, entry_fee 
        FROM rooms 
        WHERE type = 'hero' 
        AND status = 'waiting' 
        AND created_at < NOW() - INTERVAL '5 minutes'
      `);
      
      const expiredRooms = expiredRoomsResult.rows;
      
      if (expiredRooms.length > 0) {
        console.log(`[Очистка комнат] Найдено ${expiredRooms.length} просроченных Hero-комнат`);
        
        for (const room of expiredRooms) {
          // Возвращаем средства всем участникам одним запросом
          await client.query(`
            UPDATE users u
            SET balance_stars = balance_stars + $1
            FROM participants p
            WHERE p.room_id = $2 AND u.id = p.user_id
          `, [room.entry_fee, room.id]);
          
          // Записываем транзакции возврата
          await client.query(`
            INSERT INTO transactions (id, user_id, amount, type, description)
            SELECT 
              gen_random_uuid(), 
              p.user_id, 
              $1, 
              'payout', 
              'Возврат за истекшую Hero-комнату ' || $2
            FROM participants p 
            WHERE p.room_id = $2
          `, [room.entry_fee, room.id]);
          
          // Удаляем комнату
          await client.query('DELETE FROM rooms WHERE id = $1', [room.id]);
        }
        
        console.log(`[Очистка комнат] Обработка завершена, возвращены средства участникам`);
      }
      
      return expiredRooms.length;
    } catch (error) {
      console.error('[Очистка комнат] Ошибка:', error);
      throw error;
    }
  }

  // Получение списка всех доступных комнат
  router.get('/', async (req, res) => {
    try {
      // Удаляем просроченные Hero-комнаты
      await pool.query(`
        DELETE FROM rooms 
        WHERE type = 'hero' 
        AND status = 'waiting' 
        AND created_at < NOW() - INTERVAL '5 minutes'
      `);

      // Получаем активные комнаты с количеством игроков
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
      console.error('Ошибка при получении списка комнат:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
  });

  // Получение информации о конкретной комнате с участниками
  router.get('/:roomId', async (req, res) => {
    try {
      const { roomId } = req.params;

      const roomResult = await pool.query('SELECT * FROM rooms WHERE id = $1', [roomId]);

      if (roomResult.rows.length === 0) {
        return res.status(404).json({ message: 'Комната не найдена' });
      }

      const room = roomResult.rows[0];

      const participantsResult = await pool.query(`
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
      `, [roomId]);

      const roomData = {
        ...room,
        participants: participantsResult.rows,
      };

      res.json(roomData);
    } catch (error) {
      console.error('Ошибка при получении данных комнаты:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
  });

  // Создание новой комнаты
  router.post('/', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { creator_id, type, entry_fee, max_players = 10 } = req.body;

      if (!creator_id || !type || entry_fee === undefined) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Необходимо указать creator_id, type и entry_fee'
        });
      }

      if (type === 'hero') {
        const existingRoomCheck = await client.query(
          'SELECT * FROM rooms WHERE creator_id = $1 AND status = $2',
          [creator_id, 'waiting']
        );

        if (existingRoomCheck.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            message: 'У вас уже есть открытая комната',
            room: existingRoomCheck.rows[0]
          });
        }
      }

      const userCheck = await client.query(
        'SELECT balance_stars FROM users WHERE id = $1',
        [creator_id]
      );

      if (userCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      const userBalance = parseFloat(userCheck.rows[0].balance_stars);
      const roomFee = parseFloat(entry_fee);

      if (userBalance < roomFee) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Недостаточно средств' });
      }

      const roomId = uuidv4();
      const roomKey = type === 'hero' ? await generateUniqueRoomKey(client) : null;
      const actualMaxPlayers = type === 'hero' ? 30 : max_players;

      const roomResult = await client.query(
        'INSERT INTO rooms (id, creator_id, type, entry_fee, max_players, status, room_key, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING *',
        [roomId, creator_id, type, roomFee, actualMaxPlayers, 'waiting', roomKey]
      );

      await client.query(
        'UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2',
        [roomFee, creator_id]
      );

      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [uuidv4(), creator_id, roomFee, 'entry', `Взнос за ${type === 'hero' ? 'Hero' : 'обычную'} комнату ${roomId}`]
      );

      if (type !== 'hero') {
        await client.query(
          'INSERT INTO participants (id, room_id, user_id) VALUES ($1, $2, $3)',
          [uuidv4(), roomId, creator_id]
        );
      }

      await client.query('COMMIT');
      res.status(201).json(roomResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при создании комнаты:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Присоединение к комнате по ID (для обычных комнат)
  router.post('/:roomId/join', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { roomId } = req.params;
      const { user_id } = req.body;

      if (!user_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Необходимо указать user_id' });
      }

      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE id = $1 AND status = $2',
        [roomId, 'waiting']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          message: 'Комната не найдена или не находится в статусе ожидания' 
        });
      }

      const room = roomCheck.rows[0];

      if (room.type === 'hero') {
        const createdAt = new Date(room.created_at);
        const now = new Date();
        const timeDiffMinutes = (now - createdAt) / (1000 * 60);

        if (timeDiffMinutes > 5) {
          await client.query('DELETE FROM rooms WHERE id = $1', [roomId]);
          await client.query('ROLLBACK');
          return res.status(410).json({
            message: 'Организатор не запустил игру вовремя. Свяжитесь с организатором или введите другой ключ.'
          });
        }
      }

      const userCheck = await client.query(
        'SELECT balance_stars FROM users WHERE id = $1',
        [user_id]
      );

      if (userCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      const userBalance = parseFloat(userCheck.rows[0].balance_stars);
      const roomFee = parseFloat(room.entry_fee);

      if (userBalance < roomFee) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Недостаточно средств' });
      }

      const participantCheck = await client.query(
        'SELECT * FROM participants WHERE room_id = $1 AND user_id = $2',
        [roomId, user_id]
      );

      if (participantCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Вы уже присоединились к этой комнате' });
      }

      const participantCount = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [roomId]
      );

      if (parseInt(participantCount.rows[0].count) >= room.max_players) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Комната заполнена' });
      }

      await client.query(
        'UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2',
        [roomFee, user_id]
      );

      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [
          uuidv4(),
          user_id,
          roomFee,
          'entry',
          `Взнос за ${room.type === 'hero' ? 'Hero' : 'обычную'} комнату ${roomId}`
        ]
      );

      const participantResult = await client.query(
        'INSERT INTO participants (id, room_id, user_id) VALUES ($1, $2, $3) RETURNING *',
        [uuidv4(), roomId, user_id]
      );

      if (room.type !== 'hero') {
        const newParticipantCount = await client.query(
          'SELECT COUNT(*) FROM participants WHERE room_id = $1',
          [roomId]
        );

        if (parseInt(newParticipantCount.rows[0].count) >= room.max_players) {
          await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
            'active',
            roomId
          ]);

          await client.query(
            'INSERT INTO games (id, room_id, start_time) VALUES ($1, $2, NOW())',
            [uuidv4(), roomId]
          );
        }
      }

      await client.query('COMMIT');
      res.status(201).json(participantResult.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при присоединении к комнате:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Присоединение к Hero-комнате по ключу
  router.post('/join-by-key', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { room_key, user_id } = req.body;

      if (!room_key || !user_id) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          message: 'Необходимо указать room_key и user_id' 
        });
      }

      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE room_key = $1 AND status = $2 AND type = $3',
        [room_key, 'waiting', 'hero']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          message: 'Комната не найдена или не находится в статусе ожидания' 
        });
      }

      const room = roomCheck.rows[0];

      const createdAt = new Date(room.created_at);
      const now = new Date();
      const timeDiffMinutes = (now - createdAt) / (1000 * 60);

      if (timeDiffMinutes > 5) {
        await client.query('DELETE FROM rooms WHERE id = $1', [room.id]);
        await client.query('ROLLBACK');
        return res.status(410).json({
          message: 'Организатор не запустил игру вовремя. Свяжитесь с организатором или введите другой ключ.'
        });
      }

      const userCheck = await client.query(
        'SELECT balance_stars FROM users WHERE id = $1',
        [user_id]
      );

      if (userCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Пользователь не найден' });
      }

      const userBalance = parseFloat(userCheck.rows[0].balance_stars);
      const roomFee = parseFloat(room.entry_fee);

      if (userBalance < roomFee) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Недостаточно средств' });
      }

      const participantCheck = await client.query(
        'SELECT * FROM participants WHERE room_id = $1 AND user_id = $2',
        [room.id, user_id]
      );

      if (participantCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Вы уже присоединились к этой комнате' });
      }

      const participantCount = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [room.id]
      );

      if (parseInt(participantCount.rows[0].count) >= room.max_players) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Комната заполнена' });
      }

      await client.query(
        'UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2',
        [roomFee, user_id]
      );

      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [
          uuidv4(),
          user_id,
          roomFee,
          'entry',
          `Взнос за Hero-комнату ${room.id}`
        ]
      );

      const participantResult = await client.query(
        'INSERT INTO participants (id, room_id, user_id) VALUES ($1, $2, $3) RETURNING *',
        [uuidv4(), room.id, user_id]
      );

      await client.query('COMMIT');
      res.status(201).json({
        participant: participantResult.rows[0],
        room: room
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при присоединении к комнате по ключу:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Запуск игры в комнате (только для создателя комнаты)
  router.post('/:roomId/start', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { roomId } = req.params;
      const { userId } = req.body;

      if (!userId) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Необходимо указать userId' });
      }

      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE id = $1 AND status = $2',
        [roomId, 'waiting']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          message: 'Комната не найдена или не находится в статусе ожидания' 
        });
      }

      const room = roomCheck.rows[0];

      if (room.creator_id !== userId) {
        await client.query('ROLLBACK');
        return res.status(403).json({ 
          message: 'Только создатель комнаты может запустить игру' 
        });
      }

      await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
        'active',
        roomId
      ]);

      const gameId = uuidv4();
      await client.query(
        'INSERT INTO games (id, room_id, start_time) VALUES ($1, $2, NOW())',
        [gameId, roomId]
      );

      await client.query('COMMIT');
      res.json({
        message: 'Игра успешно запущена',
        gameId: gameId,
        roomId: roomId
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при запуске игры:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Маршрут для режима наблюдения (для организатора)
  router.post('/:roomId/observe', async (req, res) => {
    try {
      const { roomId } = req.params;
      const { userId } = req.body;
      
      const room = (await pool.query(
        `SELECT creator_id FROM rooms WHERE id=$1`, [roomId]
      )).rows[0];
      
      if (!room || room.creator_id !== userId) {
        return res.status(403).json({ message: 'Доступ запрещен' });
      }
      
      const participants = (await pool.query(`
        SELECT u.id, u.username
        FROM participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.room_id = $1
      `, [roomId])).rows;
      
      res.json({ participants });
    } catch (error) {
      console.error('Ошибка при получении данных для наблюдения:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    }
  });

  // Эндпоинт для очистки истекших комнат (для вызова CRON-задачей)
  router.post('/cleanup-expired', async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      
      const cleanedCount = await cleanupExpiredRooms(client);
      
      await client.query('COMMIT');
      res.json({ message: `Обработано ${cleanedCount} истекших комнат` });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при очистке истекших комнат:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Автоматическая очистка просроченных Hero-комнат
  setInterval(async () => {
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await cleanupExpiredRooms(client);
      await client.query('COMMIT');
    } catch (error) {
      if (client) {
        await client.query('ROLLBACK');
      }
      console.error('[Интервал очистки] Ошибка:', error);
    } finally {
      if (client) {
        client.release();
      }
    }
  }, 60 * 1000); // Проверка каждую минуту

  return router;
}