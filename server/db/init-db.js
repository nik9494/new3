import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Pool } from 'pg';

// Для получения __dirname в ES-модулях
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Загрузка переменных окружения из .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Настройка подключения к базе данных
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || 'tapbattle',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  connectionTimeoutMillis: 30000,
});

// Лог параметров подключения (без пароля)
console.log('Database connection parameters:', {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  database: process.env.DB_NAME || 'tapbattle',
  user: process.env.DB_USER || 'postgres',
});

async function initializeDatabase() {
  const client = await pool.connect();

  try {
    console.log('Starting database initialization...');

    // Читаем файл схемы и создаем базовые таблицы
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schemaSql);
    console.log('Base schema created successfully');

    // Добавляем колонку room_key (nullable)
    console.log('Adding room_key column to rooms (if missing)...');
    await client.query(`
      ALTER TABLE rooms
        ADD COLUMN IF NOT EXISTS room_key VARCHAR(6);
    `);

    // Заполняем room_key для существующих записей
    console.log('Populating room_key for existing rooms...');
    await client.query(`
      UPDATE rooms
      SET room_key = substr(md5(gen_random_uuid()::text), 1, 6)
      WHERE room_key IS NULL;
    `);

    // Делаем поле NOT NULL и добавляем уникальное ограничение
    console.log('Applying NOT NULL and UNIQUE constraints on room_key...');
    await client.query(`
      ALTER TABLE rooms
        ALTER COLUMN room_key SET NOT NULL;
      ALTER TABLE rooms
        ADD CONSTRAINT rooms_room_key_unique UNIQUE (room_key);
    `);
    console.log('room_key column added, populated and constrained successfully');

    // Создаём стандартные комнаты
    await createStandardRooms(client);
    console.log('Standard rooms created successfully');

    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    if (error.position) console.error(`Error position: ${error.position}`);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function createStandardRooms(client) {
  // Создаём системного пользователя
  const systemUserResult = await client.query(`
    INSERT INTO users (id, telegram_id, username, balance_stars, has_ton_wallet)
    VALUES (gen_random_uuid(), 0, 'System', 1000000, false)
    RETURNING id;
  `);

  const systemUserId = systemUserResult.rows[0].id;

  // Создаём стандартные комнаты с разными входными ставками
  const entryFees = [20, 50, 80, 100, 150, 200];

  for (const fee of entryFees) {
    await client.query(
      `
      INSERT INTO rooms (id, creator_id, type, entry_fee, max_players, status, room_key)
      VALUES (gen_random_uuid(), $1, 'standard', $2, 10, 'waiting', substr(md5(gen_random_uuid()::text), 1, 6))
      `,
      [systemUserId, fee]
    );
  }
}

// Запуск инициализации
initializeDatabase()
  .then(() => {
    console.log('Database setup complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('Database setup failed:', error.message);
    process.exit(1);
  });
