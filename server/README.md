# Tap Battle Backend API

Backend API for the Tap Battle Telegram Mini App game.

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### Environment Setup

1. Create a PostgreSQL database:

```sql
CREATE DATABASE tap_battle;
```

2. Configure environment variables in `.env` file:

```
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tap_battle
DB_USER=postgres
DB_PASSWORD=your_password

# Server Configuration
PORT=3001
NODE_ENV=development

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_USERNAME=your_bot_username

# For development only
SKIP_TELEGRAM_VALIDATION=true
```

### Installation

1. Install dependencies:

```bash
npm install
```

2. Initialize the database:

```bash
node db/init-db.js
```

3. Start the server:

```bash
npm run dev
```

The server will start on http://localhost:3001

## API Endpoints

### User Management

- `GET /api/users/telegram/:telegramId` - Get user by Telegram ID
- `POST /api/users` - Create or update user
- `GET /api/users/:userId` - Get user profile with stats
- `POST /api/users/:userId/wallet` - Connect TON wallet

### Room Management

- `GET /api/rooms` - Get all available rooms
- `GET /api/rooms/:roomId` - Get room by ID with participants
- `POST /api/rooms` - Create a new room
- `POST /api/rooms/:roomId/join` - Join a room

### Game Management

- `GET /api/games/room/:roomId` - Get active game for a room
- `POST /api/games/:gameId/taps` - Record taps for a game
- `POST /api/games/:gameId/end` - End a game (time expired)

### Transaction Management

- `GET /api/transactions/user/:userId` - Get transactions for a user
- `POST /api/transactions` - Create a transaction
- `POST /api/transactions/telegram-payment` - Process Telegram payment
- `POST /api/transactions/withdraw-ton` - Process TON withdrawal

### Referral Management

- `GET /api/referrals/user/:userId` - Get referral code for a user
- `GET /api/referrals/user/:userId/uses` - Get referral uses for a user
- `POST /api/referrals/apply` - Apply a referral code
- `POST /api/referrals/generate` - Generate a new referral code for a user

### Bonus Challenge Management

- `GET /api/bonus/user/:userId` - Get bonus progress for a user
- `POST /api/bonus/start` - Start a bonus challenge
- `POST /api/bonus/taps` - Record taps for a bonus challenge
- `POST /api/bonus/reset` - Reset a bonus challenge

### Leaderboard

- `GET /api/leaderboard` - Get leaderboard data
- `GET /api/leaderboard/user/:userId` - Get user's rank in leaderboard

## Database Schema

The database schema includes the following tables:

- `users` - User profiles
- `wallets` - TON wallet addresses
- `rooms` - Game rooms
- `participants` - Room participants
- `games` - Game sessions
- `taps` - Tap records for games
- `transactions` - Financial transactions
- `referrals` - Referral codes
- `referral_uses` - Referral code usage
- `bonus_progress` - Bonus challenge progress

## Security

The API uses Row Level Security (RLS) to ensure users can only access their own data. Authentication is handled through Telegram WebApp validation.

## Real-time Features

For real-time features, you can integrate this API with WebSockets or Supabase Realtime.
