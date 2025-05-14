import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { verifyJWT } from '../middleware/auth.js';

export default function standardRoomsRoutes(pool) {
  const router = express.Router();

  // Получение списка всех доступных стандартных комнат
  router.get('/', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Получаем активные комнаты с количеством игроков
      const result = await client.query(`
        SELECT
          r.*,
          COUNT(p.id) as player_count
        FROM
          rooms r
        LEFT JOIN
          participants p ON r.id = p.room_id
        WHERE
          r.status = 'waiting'
          AND r.type = 'standard'
        GROUP BY
          r.id
        ORDER BY
          r.created_at DESC
      `);

      await client.query('COMMIT');
      res.json(result.rows);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при получении списка комнат:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Получение информации о конкретной комнате с участниками
  router.get('/:roomId', async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { roomId } = req.params;
      
      const roomResult = await client.query(`
        SELECT *
        FROM rooms r
        WHERE r.id = $1 AND r.type = 'standard'
      `, [roomId]);
      
      if (roomResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Комната не найдена' });
      }
      
      const room = roomResult.rows[0];
      
      // получаем участников
      const participantsResult = await client.query(`
        SELECT
          p.id, p.joined_at,
          u.id AS user_id, u.username, u.telegram_id
        FROM participants p
        JOIN users u ON p.user_id = u.id
        WHERE p.room_id = $1
        ORDER BY p.joined_at ASC
      `, [roomId]);
      
      await client.query('COMMIT');
      return res.json({
        ...room,
        participants: participantsResult.rows,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ message: 'Ошибка сервера' });
    } finally {
      client.release();
    }
  });

  // Автоматическое присоединение к комнате или создание новой
  router.post('/join', verifyJWT(), async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const user_id = req.user.id;
      const { entry_fee = 10 } = req.body; // По умолчанию 10 звезд, если не указано иное
      const max_players = 10; // Фиксированное значение для стандартных комнат

      // Проверка баланса пользователя
      const userCheck = await client.query(
        'SELECT balance_stars FROM users WHERE id = $1',
        [user_id]
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

      // Проверяем, есть ли уже комната с этим игроком
      const existingParticipation = await client.query(`
        SELECT r.id 
        FROM rooms r 
        JOIN participants p ON r.id = p.room_id 
        WHERE p.user_id = $1 AND r.status IN ('waiting', 'active') AND r.type = 'standard'
      `, [user_id]);

      if (existingParticipation.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          message: 'Вы уже участвуете в другой комнате. Завершите игру или дождитесь её окончания.' 
        });
      }

      // Поиск доступной комнаты с таким же entry_fee
      const availableRoomCheck = await client.query(`
        SELECT r.id, COUNT(p.id) as player_count
        FROM rooms r
        LEFT JOIN participants p ON r.id = p.room_id
        WHERE r.status = 'waiting' AND r.type = 'standard' AND r.entry_fee = $1
        GROUP BY r.id
        HAVING COUNT(p.id) < $2
        ORDER BY r.created_at ASC
        LIMIT 1
      `, [roomFee, max_players]);

      let roomId;
      let isNewRoom = false;

      if (availableRoomCheck.rows.length > 0) {
        // Если есть доступная комната, присоединяемся к ней
        roomId = availableRoomCheck.rows[0].id;
      } else {
        // Если нет, создаем новую комнату
        roomId = uuidv4();
        isNewRoom = true;

        await client.query(
          `INSERT INTO rooms (id, type, entry_fee, max_players, status, created_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           RETURNING *`,
          [roomId, 'standard', roomFee, max_players, 'waiting']
        );
      }

      // Списываем средства с пользователя
      await client.query(
        'UPDATE users SET balance_stars = balance_stars - $1 WHERE id = $2',
        [roomFee, user_id]
      );

      // Создаем запись о транзакции
      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [uuidv4(), user_id, roomFee, 'entry', `Взнос за стандартную комнату ${roomId}`]
      );

      // Добавляем пользователя как участника
      await client.query(
        'INSERT INTO participants (id, room_id, user_id) VALUES ($1, $2, $3)',
        [uuidv4(), roomId, user_id]
      );

      // Проверяем количество игроков в комнате после присоединения
      const newParticipantCount = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [roomId]
      );

      let gameStarting = false;
      
      // Если комната заполнена, автоматически запускаем предварительный таймер
      if (parseInt(newParticipantCount.rows[0].count) >= max_players) {
        // Обновляем статус комнаты
        await client.query('UPDATE rooms SET status = $1, preparation_started_at = NOW() WHERE id = $2', [
          'preparation',
          roomId
        ]);
        
        gameStarting = true;
        
        // Здесь будет логика для запуска таймера
        // В реальном приложении это будет обрабатываться асинхронно
        // например, через систему заданий или WebSocket
      }

      await client.query('COMMIT');
      
      if (isNewRoom) {
        res.status(201).json({
          message: 'Создана новая комната и вы успешно присоединились',
          roomId: roomId,
          gameStarting: gameStarting
        });
      } else {
        res.status(200).json({
          message: 'Вы успешно присоединились к существующей комнате',
          roomId: roomId,
          gameStarting: gameStarting
        });
      }
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при присоединении/создании комнаты:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Эндпоинт для запуска игры (вызывается автоматически через таймер)
  router.post('/:roomId/start-game', async (req, res) => {
    const client = await pool.connect();
    const { secret_key } = req.body;

    // Проверка секретного ключа для внутреннего API
    if (secret_key !== process.env.INTERNAL_API_KEY) {
      return res.status(403).json({ message: 'Недостаточно прав для выполнения этой операции' });
    }

    try {
      await client.query('BEGIN');

      const { roomId } = req.params;

      // Проверяем статус комнаты
      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE id = $1 AND type = $2',
        [roomId, 'standard']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Комната не найдена' });
      }

      const room = roomCheck.rows[0];

      if (room.status !== 'preparation') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Комната не находится в статусе подготовки' });
      }

      // Проверка количества участников
      const participantCount = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [roomId]
      );

      if (parseInt(participantCount.rows[0].count) < 2) {
        // Если игроков меньше 2, возвращаем деньги и отменяем
        await client.query(`
          UPDATE users u
          SET balance_stars = balance_stars + $1
          FROM participants p
          WHERE p.room_id = $2 AND u.id = p.user_id
        `, [room.entry_fee, roomId]);
        
        // Записываем транзакции возврата
        await client.query(`
          INSERT INTO transactions (id, user_id, amount, type, description)
          SELECT
            gen_random_uuid(),
            p.user_id,
            $1,
            'refund',
            'Возврат за отмененную комнату из-за недостаточного числа игроков ' || $2
          FROM participants p
          WHERE p.room_id = $2
        `, [room.entry_fee, roomId]);
        
        await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
          'canceled',
          roomId
        ]);
        
        await client.query('COMMIT');
        return res.status(200).json({ 
          message: 'Комната отменена из-за недостаточного числа игроков. Средства возвращены участникам.' 
        });
      }

      // Запускаем игру
      await client.query('UPDATE rooms SET status = $1, game_started_at = NOW() WHERE id = $2', [
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

  // Завершение игры и выплата победителю (вызывается автоматически через таймер или после получения результатов)
  router.post('/:roomId/finish-game', async (req, res) => {
    const client = await pool.connect();
    const { secret_key, winner_id } = req.body;

    // Проверка секретного ключа для внутреннего API
    if (secret_key !== process.env.INTERNAL_API_KEY) {
      return res.status(403).json({ message: 'Недостаточно прав для выполнения этой операции' });
    }

    if (!winner_id) {
      return res.status(400).json({
        message: 'Необходимо указать winner_id'
      });
    }

    try {
      await client.query('BEGIN');

      const { roomId } = req.params;

      // Проверяем статус комнаты
      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE id = $1 AND type = $2',
        [roomId, 'standard']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Комната не найдена' });
      }

      const room = roomCheck.rows[0];

      if (room.status !== 'active') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Комната должна быть в статусе active' });
      }

      // Проверяем, является ли победитель участником комнаты
      const winnerCheck = await client.query(
        'SELECT * FROM participants WHERE room_id = $1 AND user_id = $2',
        [roomId, winner_id]
      );

      if (winnerCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Указанный победитель не является участником комнаты'
        });
      }

      // Считаем общую сумму выигрыша (все взносы участников)
      const totalParticipants = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [roomId]
      );

      const totalPrize = parseFloat(room.entry_fee) * parseInt(totalParticipants.rows[0].count);

      // Зачисляем выигрыш победителю
      await client.query(
        'UPDATE users SET balance_stars = balance_stars + $1 WHERE id = $2',
        [totalPrize, winner_id]
      );

      // Запись транзакции о выигрыше
      await client.query(
        'INSERT INTO transactions (id, user_id, amount, type, description) VALUES ($1, $2, $3, $4, $5)',
        [
          uuidv4(),
          winner_id,
          totalPrize,
          'prize',
          `Выигрыш в стандартной комнате ${roomId}`
        ]
      );

      // Обновляем статус комнаты
      await client.query('UPDATE rooms SET status = $1, finished_at = NOW() WHERE id = $2', [
        'finished',
        roomId
      ]);

      // Обновляем информацию о победителе в таблице игр
      await client.query(
        'UPDATE games SET winner_id = $1, end_time = NOW() WHERE room_id = $2',
        [winner_id, roomId]
      );

      await client.query('COMMIT');
      res.json({
        message: 'Игра успешно завершена',
        winner_id: winner_id,
        prize: totalPrize
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при завершении игры:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Обработка ошибок и возврат средств
  router.post('/:roomId/handle-error', async (req, res) => {
    const client = await pool.connect();
    const { secret_key, error_type } = req.body;

    // Проверка секретного ключа для внутреннего API
    if (secret_key !== process.env.INTERNAL_API_KEY) {
      return res.status(403).json({ message: 'Недостаточно прав для выполнения этой операции' });
    }

    try {
      await client.query('BEGIN');

      const { roomId } = req.params;

      // Проверяем статус комнаты
      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE id = $1 AND type = $2',
        [roomId, 'standard']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Комната не найдена' });
      }

      const room = roomCheck.rows[0];

      if (room.status === 'finished' || room.status === 'canceled') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Игра уже завершена или отменена' });
      }

      // Возврат средств всем участникам
      await client.query(`
        UPDATE users u
        SET balance_stars = balance_stars + $1
        FROM participants p
        WHERE p.room_id = $2 AND u.id = p.user_id
      `, [room.entry_fee, roomId]);
      
      // Записываем транзакции возврата
      await client.query(`
        INSERT INTO transactions (id, user_id, amount, type, description)
        SELECT
          gen_random_uuid(),
          p.user_id,
          $1,
          'refund',
          'Возврат за комнату с ошибкой: ' || $3 || ' - ' || $2
        FROM participants p
        WHERE p.room_id = $2
      `, [room.entry_fee, roomId, error_type]);
      
      // Обновляем статус комнаты
      await client.query('UPDATE rooms SET status = $1, error_message = $2 WHERE id = $3', [
        'error',
        error_type,
        roomId
      ]);

      await client.query('COMMIT');
      res.json({
        message: 'Ошибка обработана, средства возвращены участникам',
        roomId: roomId
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при обработке ошибки комнаты:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Выход из комнаты (добровольный, с потерей средств)
  router.post('/:roomId/leave', verifyJWT(), async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { roomId } = req.params;
      const user_id = req.user.id;

      // Проверяем статус комнаты
      const roomCheck = await client.query(
        'SELECT * FROM rooms WHERE id = $1 AND type = $2',
        [roomId, 'standard']
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Комната не найдена' });
      }

      const room = roomCheck.rows[0];

      if (room.status !== 'waiting') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          message: 'Выход возможен только из комнаты в состоянии ожидания' 
        });
      }

      // Проверяем, является ли пользователь участником комнаты
      const participantCheck = await client.query(
        'SELECT * FROM participants WHERE room_id = $1 AND user_id = $2',
        [roomId, user_id]
      );

      if (participantCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: 'Вы не являетесь участником этой комнаты'
        });
      }

      // Удаляем участника
      await client.query(
        'DELETE FROM participants WHERE room_id = $1 AND user_id = $2',
        [roomId, user_id]
      );

      // Проверяем, остались ли еще участники
      const remainingParticipants = await client.query(
        'SELECT COUNT(*) FROM participants WHERE room_id = $1',
        [roomId]
      );

      // Если не осталось участников, помечаем комнату как отмененную
      if (parseInt(remainingParticipants.rows[0].count) === 0) {
        await client.query('UPDATE rooms SET status = $1 WHERE id = $2', [
          'canceled',
          roomId
        ]);
      }

      await client.query('COMMIT');
      res.json({
        message: 'Вы успешно вышли из комнаты. Средства не возвращаются.',
        roomId: roomId
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Ошибка при выходе из комнаты:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  // Маршрут для получения актуального статуса комнаты
  router.get('/:roomId/status', async (req, res) => {
    const client = await pool.connect();
    try {
      const { roomId } = req.params;
      
      const roomResult = await client.query(`
        SELECT 
          r.id, r.status, r.entry_fee, r.max_players, 
          r.preparation_started_at, r.game_started_at, r.finished_at,
          COUNT(p.id) as player_count
        FROM rooms r
        LEFT JOIN participants p ON r.id = p.room_id
        WHERE r.id = $1 AND r.type = 'standard'
        GROUP BY r.id
      `, [roomId]);
      
      if (roomResult.rows.length === 0) {
        return res.status(404).json({ message: 'Комната не найдена' });
      }
      
      const room = roomResult.rows[0];
      
      // Вычисляем оставшееся время подготовки или игры
      let remainingTime = null;
      let phase = null;
      
      if (room.status === 'preparation' && room.preparation_started_at) {
        const preparationTime = 30; // 30 секунд на подготовку
        const prepStartedAt = new Date(room.preparation_started_at);
        const elapsed = (Date.now() - prepStartedAt) / 1000;
        remainingTime = Math.max(0, preparationTime - elapsed);
        phase = 'preparation';
      } else if (room.status === 'active' && room.game_started_at) {
        const gameTime = 60; // 60 секунд на игру
        const gameStartedAt = new Date(room.game_started_at);
        const elapsed = (Date.now() - gameStartedAt) / 1000;
        remainingTime = Math.max(0, gameTime - elapsed);
        phase = 'game';
      }
      
      res.json({
        ...room,
        remainingTime,
        phase
      });
    } catch (error) {
      console.error('Ошибка при получении статуса комнаты:', error);
      res.status(500).json({ message: 'Ошибка сервера', error: error.message });
    } finally {
      client.release();
    }
  });

  return router;
}