import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import TelegramBot from 'node-telegram-bot-api';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { apiRateLimit, tapRateLimit, detectVPN } from './middleware/auth.js';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// ES modules fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

// Import routes dynamically
const importRoutes = async () => {
  const usersRoutes = (await import('./routes/users.js')).default;
  const roomsRoutes = (await import('./routes/rooms.js')).default;
  const gamesRoutes = (await import('./routes/games.js')).default;
  const transactionsRoutes = (await import('./routes/transactions.js')).default;
  const referralsRoutes = (await import('./routes/referrals.js')).default;
  const bonusRoutes = (await import('./routes/bonus.js')).default;
  const leaderboardRoutes = (await import('./routes/leaderboard.js')).default;

  return {
    usersRoutes,
    roomsRoutes,
    gamesRoutes,
    transactionsRoutes,
    referralsRoutes,
    bonusRoutes,
    leaderboardRoutes,
  };
};

// Environment variables
const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MINI_APP_URL =
  process.env.MINI_APP_URL ||
  'https://consists-coastal-fight-charms.trycloudflare.com';

// Database connection
const { Pool } = pg;

// Create database pool with proper error handling
const createDatabasePool = async () => {
  console.log('Connecting to database with parameters:', {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tapbattle',
    user: process.env.DB_USER || 'postgres',
  });

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'tapbattle',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    connectionTimeoutMillis: 30000,
  });

  try {
    const client = await pool.connect();
    console.log('Database connection test successful');

    // Check if users table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('Tables not found, initializing database schema...');
      const schemaPath = path.join(__dirname, 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');

      try {
        await client.query('BEGIN');
        await client.query(schema);
        await client.query('COMMIT');
        console.log('Database schema initialized successfully');
      } catch (schemaError) {
        await client.query('ROLLBACK');
        console.error('Error initializing schema:', schemaError);
        throw schemaError;
      }
    } else {
      console.log('Database tables already exist');
    }

    client.release();
    return pool;
  } catch (err) {
    console.error('Failed to connect to database:', err);
    console.error('Details:', err.message);

    if (err.code === 'ECONNREFUSED') {
      console.error('Make sure PostgreSQL is running and accessible');
    } else if (err.code === '3D000') {
      console.error(
        `Database '${process.env.DB_NAME || 'tapbattle'}' does not exist. Run 'node server/db/create-db.js' to create it.`
      );
    } else if (err.code === '28P01') {
      console.error('Invalid username or password for PostgreSQL');
    }

    process.exit(1);
  }
};

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Настройка Trust Proxy в Express
app.set('trust proxy', [
  'loopback',
  'linklocal',
  'uniquelocal',
  '173.245.48.0/20', // Cloudflare IPv4
  '2400:cb00::/32', // Cloudflare IPv6
  '10.0.0.0/8', // Локальные сети
  '172.16.0.0/12', // Docker
  '192.168.0.0/16', // Локальные сети
]);

// Parse Mini App URL for CORS configuration
const allowedOrigins = [
  'https://consists-coastal-fight-charms.trycloudflare.com',
  'https://web.telegram.org',
  'https://telegram.org',
];

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.some(allowed => origin.startsWith(allowed))
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'", ...allowedOrigins],
        connectSrc: ["'self'", ...allowedOrigins],
        imgSrc: ["'self'", 'data:', ...allowedOrigins],
        styleSrc: ["'self'", "'unsafe-inline'", ...allowedOrigins],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          ...allowedOrigins,
        ],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Оптимизация CORS
app.use(
  cors({
    origin: (origin, callback) => {
      console.log('Request origin:', origin);
      if (
        !origin ||
        allowedOrigins.some(allowed => origin.startsWith(allowed))
      ) {
        callback(null, true);
      } else {
        console.error('CORS blocked:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Telegram-Init-Data',
      'X-User-ID',
      'Origin',
      'Accept',
      'X-Requested-With',
    ],
    exposedHeaders: ['X-Auth-Token'],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global rate limiting с более мягкими ограничениями
app.use(
  apiRateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 300, // Увеличиваем лимит до 300 запросов за 15 минут
  })
);

// Отдельный rate limiter для критических эндпоинтов с более высоким лимитом
app.use(
  '/api/users/telegram',
  rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 20, // 20 запросов в минуту
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Слишком много запросов к API пользователя - попробуйте позже.',
    },
  })
);

app.use(
  '/api/users/init',
  rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 10, // 10 запросов в минуту
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Слишком много запросов инициализации - попробуйте позже.',
    },
  })
);

// VPN/proxy detection (optional, can be enabled in production)
if (process.env.NODE_ENV === 'production') {
  app.use(detectVPN());
}

// Health check endpoint
// Add OPTIONS handling for preflight requests
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    // Respond to preflight requests
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Telegram-Init-Data'
    );
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Private-Network', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    return res.status(204).send();
  }

  // Add specific header for Telegram WebApp to recognize responses
  res.header('Access-Control-Allow-Private-Network', 'true');
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Request headers:', req.headers);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    clientIp: req.ip,
    cloudflareIp: req.headers['cf-connecting-ip'],
    realIp: req.headers['x-real-ip'], // Дополнительная проверка
  });
});

// Setup routes and start server
const startServer = async () => {
  try {
    // Initialize database pool first
    const pool = await createDatabasePool();
    console.log(
      'Database connected successfully at:',
      new Date().toLocaleString()
    );

    pool.on('error', err => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    // Initialize Telegram Bot with error handling
    let bot;
    try {
      bot = new TelegramBot(BOT_TOKEN, { polling: true });
      console.log('Telegram bot initialized successfully');

      // Helper function to generate referral code
      function generateReferralCode(username) {
        const prefix = username.substring(0, 3).toUpperCase();
        const randomPart = Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();
        return `${prefix}${randomPart}`;
      }

      // Handle /start command
      bot.onText(/\/start/, async msg => {
        const chatId = msg.chat.id;
        console.log('Received /start command from chat:', chatId);

        try {
          const {
            id: telegram_id,
            first_name,
            last_name,
            username,
            language_code,
          } = msg.from;

          console.log('Creating/updating user in database:', {
            telegram_id,
            username,
            first_name,
            last_name,
          });

          // Begin transaction
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            // Check if user exists
            const userCheck = await client.query(
              'SELECT * FROM users WHERE telegram_id = $1',
              [telegram_id]
            );

            let userId;

            if (userCheck.rows.length === 0) {
              // Create new user with default balance
              const displayName =
                username ||
                first_name ||
                `User_${telegram_id.toString().substring(0, 6)}`;

              userId = uuidv4();

              await client.query(
                'INSERT INTO users (id, telegram_id, username, balance_stars, has_ton_wallet) VALUES ($1, $2, $3, $4, $5)',
                [userId, telegram_id, displayName, 100, false]
              );

              console.log(`New user created: ${displayName} (${telegram_id})`);

              // Check if referral code already exists for this user
              const referralCheck = await client.query(
                'SELECT * FROM referrals WHERE user_id = $1',
                [userId]
              );

              if (referralCheck.rows.length === 0) {
                // Generate referral code for new user
                const referralCode = generateReferralCode(displayName);
                await client.query(
                  'INSERT INTO referrals (code, user_id, bonus_amount) VALUES ($1, $2, $3)',
                  [referralCode, userId, 20]
                );
                console.log('Referral code generated:', referralCode);
              } else {
                console.log('User already has a referral code');
              }
            } else {
              userId = userCheck.rows[0].id;
              console.log(
                `User already exists: ${userCheck.rows[0].username} (${telegram_id})`
              );

              // Check if referral code exists for this user
              const referralCheck = await client.query(
                'SELECT * FROM referrals WHERE user_id = $1',
                [userId]
              );

              if (referralCheck.rows.length === 0) {
                // Create referral code for existing user who doesn't have one
                const displayName = userCheck.rows[0].username;
                const referralCode = generateReferralCode(displayName);
                await client.query(
                  'INSERT INTO referrals (code, user_id, bonus_amount) VALUES ($1, $2, $3)',
                  [referralCode, userId, 20]
                );
                console.log(
                  'Referral code generated for existing user:',
                  referralCode
                );
              }
            }

            await client.query('COMMIT');
          } catch (dbError) {
            await client.query('ROLLBACK');
            console.error('Database error:', dbError);
            throw dbError;
          } finally {
            client.release();
          }

          // Prepare Telegram message with proper inline keyboard button
          const keyboardData = {
            reply_markup: JSON.stringify({
              inline_keyboard: [
                [
                  {
                    text: '🎮 Играть в Tap Battle',
                    web_app: { url: MINI_APP_URL },
                  },
                ],
              ],
            }),
            parse_mode: 'HTML',
          };

          console.log(`Sending web_app button with URL: ${MINI_APP_URL}`);
          console.log(
            'Button data:',
            JSON.stringify(keyboardData.reply_markup)
          );

          // Send the message with the correct format for web_app button
          try {
            await bot.sendMessage(
              chatId,
              `<b>Добро пожаловать в Tap Battle!</b>\n\nСоревнуйтесь с другими игроками в скорости тапов, выигрывайте Stars и обменивайте их на TON.\n\nНажмите кнопку ниже, чтобы начать игру:`,
              keyboardData
            );
          } catch (messageError) {
            console.error('Error sending Telegram message:', messageError);

            // Fallback to a regular URL button if web_app fails
            const fallbackOpts = {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '🎮 Играть в Tap Battle',
                      url: MINI_APP_URL,
                    },
                  ],
                ],
              },
              parse_mode: 'HTML',
            };

            console.log('Falling back to regular URL button');

            bot.sendMessage(
              chatId,
              `<b>Добро пожаловать в Tap Battle!</b>\n\nСоревнуйтесь с другими игроками в скорости тапов, выигрывайте Stars и обменивайте их на TON.\n\nНажмите кнопку ниже, чтобы начать игру:`,
              fallbackOpts
            );
          }
        } catch (error) {
          console.error('Error processing /start command:', error);
          bot.sendMessage(
            chatId,
            `<b>Добро пожаловать в Tap Battle!</b>\n\nСоревнуйтесь с другими игроками в скорости тапов, выигрывайте Stars и обменивайте их на TON.\n\nПосетите наше приложение: ${MINI_APP_URL}`,
            { parse_mode: 'HTML' }
          );
        }
      });

      // Handle inline queries for sharing referral codes
      bot.on('inline_query', async query => {
        console.log('Received inline query:', query);
        const queryId = query.id;
        const queryText = query.query;

        const defaultResult = {
          type: 'article',
          id: 'share_tapbattle',
          title: 'Поделиться Tap Battle',
          description:
            'Пригласите друзей играть в Tap Battle и получите бонус!',
          input_message_content: {
            message_text: `Присоединяйтесь к Tap Battle! Соревнуйтесь в скорости тапов и выигрывайте призы! ${MINI_APP_URL}`,
          },
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎮 Играть в Tap Battle', url: MINI_APP_URL }],
            ],
          },
        };

        let results = [defaultResult];
        if (queryText && queryText.includes('код')) {
          const codeMatch = queryText.match(/код\s+([A-Z0-9]+)/i);
          const refCode = codeMatch ? codeMatch[1] : null;

          if (refCode) {
            console.log('Processing referral code:', refCode);
            results = [
              {
                type: 'article',
                id: 'share_referral',
                title: `Поделиться кодом ${refCode}`,
                description: 'Пригласите друзей и получите бонус!',
                input_message_content: {
                  message_text: `Присоединяйтесь к Tap Battle! Используйте мой код ${refCode} и получите 100 Stars бесплатно! ${MINI_APP_URL}`,
                },
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: '🎮 Играть в Tap Battle',
                        url: MINI_APP_URL,
                      },
                    ],
                  ],
                },
              },
            ];
          }
        }

        console.log('Sending inline query results:', results);
        bot.answerInlineQuery(queryId, results);
      });
    } catch (error) {
      console.error('Failed to initialize Telegram bot:', error);
      bot = {
        onText: () => {},
        on: () => {},
        sendMessage: () => {},
        answerInlineQuery: () => {},
      };
    }

    // Import routes
    let routes = {};
    try {
      routes = await importRoutes();
      console.log('Routes imported successfully');
    } catch (error) {
      console.error('Failed to import routes:', error);
      process.exit(1);
    }

    // Setup API routes
    app.use('/api/users', routes.usersRoutes(pool));
    app.use('/api/rooms', routes.roomsRoutes(pool));
    app.use('/api/games/:gameId/taps', tapRateLimit());
    app.use('/api/games', routes.gamesRoutes(pool));
    app.use('/api/transactions', routes.transactionsRoutes(pool));
    app.use('/api/referrals', routes.referralsRoutes(pool));
    app.use('/api/bonus', routes.bonusRoutes(pool));
    app.use('/api/leaderboard', routes.leaderboardRoutes(pool));

    console.log('API routes setup completed');

    // Socket.IO event handlers
    io.on('connection', socket => {
      console.log('New client connected:', socket.id);

      socket.on('joinRoom', data => {
        const { channel, tableName, filter, filterValue } = data;
        console.log(`Client ${socket.id} joining room: ${channel}`);
        socket.join(channel);

        // If this is a database-backed channel, fetch initial data
        if (tableName && filter && filterValue) {
          const validTableNames = ['rooms', 'games', 'participants', 'taps'];
          const validFilters = ['id', 'room_id', 'game_id', 'user_id'];

          if (
            !validTableNames.includes(tableName) ||
            !validFilters.includes(filter)
          ) {
            console.error('Invalid table name or filter in joinRoom request');
            return;
          }

          pool.query(
            `SELECT * FROM ${tableName} WHERE ${filter} = $1`,
            [filterValue],
            (err, result) => {
              if (err) {
                console.error('Error fetching initial data:', err);
                return;
              }

              if (result.rows.length > 0) {
                socket.emit('update', result.rows[0]);
              }
            }
          );
        }
      });

      socket.on('message', data => {
        const { channel, payload } = data;
        console.log(`Message to ${channel}:`, payload);
        io.to(channel).emit('update', payload);
      });

      socket.on('publish', data => {
        const { channel, event, payload } = data;
        console.log(`Publishing to ${channel}:${event}`, payload);
        io.to(channel).emit(`${channel}:${event}`, payload);
      });

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });

    // Start the server
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Socket.IO server initialized`);
      console.log(
        `Telegram bot started. Token: ${BOT_TOKEN ? BOT_TOKEN.substring(0, 8) + '...' : 'not set'}`
      );
      console.log(`Mini App URL: ${MINI_APP_URL}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();