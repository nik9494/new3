-- Drop tables if they exist (for clean setup)
DROP TABLE IF EXISTS bonus_progress CASCADE;
DROP TABLE IF EXISTS referral_uses CASCADE;
DROP TABLE IF EXISTS referrals CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS taps CASCADE;
DROP TABLE IF EXISTS games CASCADE;
DROP TABLE IF EXISTS participants CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS wallets CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table
CREATE TABLE users (
  id UUID PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(100) NOT NULL,
  balance_stars DECIMAL(10, 2) DEFAULT 0 NOT NULL,
  has_ton_wallet BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create wallets table
CREATE TABLE wallets (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ton_address VARCHAR(100) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- Create rooms table
CREATE TABLE rooms (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('standard', 'bonus', 'hero')),
  entry_fee DECIMAL(10, 2) NOT NULL,
  max_players INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('waiting', 'active', 'finished')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create participants table
CREATE TABLE participants (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(room_id, user_id)
);

-- Create games table
CREATE TABLE games (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  winner_id UUID REFERENCES users(id)
);

-- Create taps table
CREATE TABLE taps (
  id UUID PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  count INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('entry', 'payout', 'fee', 'referral')),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create referrals table
CREATE TABLE referrals (
  code VARCHAR(50) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bonus_amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(user_id)
);

-- Create referral_uses table
CREATE TABLE referral_uses (
  id UUID PRIMARY KEY,
  code VARCHAR(50) NOT NULL REFERENCES referrals(code) ON DELETE CASCADE,
  referred_user UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  UNIQUE(referred_user)
);

-- Create bonus_progress table
CREATE TABLE bonus_progress (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  taps_so_far INTEGER DEFAULT 0 NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  completed BOOLEAN DEFAULT FALSE NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_participants_room_id ON participants(room_id);
CREATE INDEX idx_participants_user_id ON participants(user_id);
CREATE INDEX idx_games_room_id ON games(room_id);
CREATE INDEX idx_taps_game_id ON taps(game_id);
CREATE INDEX idx_taps_user_id ON taps(user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_referral_uses_code ON referral_uses(code);
CREATE INDEX idx_bonus_progress_user_id ON bonus_progress(user_id);

-- Add Row Level Security (RLS) policies
-- Enable RLS on tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bonus_progress ENABLE ROW LEVEL SECURITY;

-- Create app.current_user_id parameter for RLS
CREATE OR REPLACE FUNCTION set_current_user_id(user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_user_id', user_id::TEXT, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies
-- Users can only see and modify their own data
CREATE POLICY users_policy ON users
  USING (id = current_setting('app.current_user_id', TRUE)::UUID);

-- Users can only see and modify their own wallets
CREATE POLICY wallets_policy ON wallets
  USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Users can only see their own transactions
CREATE POLICY transactions_policy ON transactions
  USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Users can only see and modify their own bonus progress
CREATE POLICY bonus_progress_policy ON bonus_progress
  USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

-- Create functions for common operations
-- Function to join a room
CREATE OR REPLACE FUNCTION join_room(p_user_id UUID, p_room_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT, participant_id UUID) AS $$
DECLARE
  v_room RECORD;
  v_user_balance DECIMAL(10, 2);
  v_participant_count INTEGER;
  v_participant_id UUID;
BEGIN
  -- Check if room exists and is in waiting status
  SELECT * INTO v_room FROM rooms WHERE id = p_room_id AND status = 'waiting';
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Room not found or not in waiting status', NULL::UUID;
    RETURN;
  END IF;
  
  -- Check if user has enough balance
  SELECT balance_stars INTO v_user_balance FROM users WHERE id = p_user_id;
  IF v_user_balance < v_room.entry_fee THEN
    RETURN QUERY SELECT FALSE, 'Insufficient balance', NULL::UUID;
    RETURN;
  END IF;
  
  -- Check if user is already in the room
  IF EXISTS (SELECT 1 FROM participants WHERE room_id = p_room_id AND user_id = p_user_id) THEN
    RETURN QUERY SELECT FALSE, 'User already in room', NULL::UUID;
    RETURN;
  END IF;
  
  -- Check if room is full
  SELECT COUNT(*) INTO v_participant_count FROM participants WHERE room_id = p_room_id;
  IF v_participant_count >= v_room.max_players THEN
    RETURN QUERY SELECT FALSE, 'Room is full', NULL::UUID;
    RETURN;
  END IF;
  
  -- Deduct entry fee
  UPDATE users SET balance_stars = balance_stars - v_room.entry_fee WHERE id = p_user_id;
  
  -- Record transaction
  INSERT INTO transactions (id, user_id, amount, type, description)
  VALUES (gen_random_uuid(), p_user_id, v_room.entry_fee, 'entry', 'Entry fee for room ' || p_room_id);
  
  -- Add user as participant
  v_participant_id := gen_random_uuid();
  INSERT INTO participants (id, room_id, user_id)
  VALUES (v_participant_id, p_room_id, p_user_id);
  
  -- Check if room is now full and should start
  SELECT COUNT(*) INTO v_participant_count FROM participants WHERE room_id = p_room_id;
  IF v_participant_count >= v_room.max_players THEN
    -- Update room status to active
    UPDATE rooms SET status = 'active' WHERE id = p_room_id;
    
    -- Create a new game
    INSERT INTO games (id, room_id) VALUES (gen_random_uuid(), p_room_id);
  END IF;
  
  RETURN QUERY SELECT TRUE, 'Successfully joined room', v_participant_id;
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to end a game and distribute rewards
CREATE OR REPLACE FUNCTION end_game(p_game_id UUID, p_winner_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT) AS $$
DECLARE
  v_game RECORD;
  v_room RECORD;
  v_participant_count INTEGER;
  v_prize_pool DECIMAL(10, 2);
BEGIN
  -- Check if game exists and is active
  SELECT * INTO v_game FROM games WHERE id = p_game_id AND end_time IS NULL;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Game not found or already ended';
    RETURN;
  END IF;
  
  -- Get room info
  SELECT * INTO v_room FROM rooms WHERE id = v_game.room_id;
  
  -- Update game record
  UPDATE games SET end_time = NOW(), winner_id = p_winner_id WHERE id = p_game_id;
  
  -- Update room status
  UPDATE rooms SET status = 'finished' WHERE id = v_room.id;
  
  -- If there's a winner, award the prize
  IF p_winner_id IS NOT NULL THEN
    -- Calculate prize pool
    SELECT COUNT(*) INTO v_participant_count FROM participants WHERE room_id = v_room.id;
    v_prize_pool := v_room.entry_fee * v_participant_count;
    
    -- Award prize to winner
    UPDATE users SET balance_stars = balance_stars + v_prize_pool WHERE id = p_winner_id;
    
    -- Record transaction
    INSERT INTO transactions (id, user_id, amount, type, description)
    VALUES (gen_random_uuid(), p_winner_id, v_prize_pool, 'payout', 'Prize for winning game ' || p_game_id);
  END IF;
  
  RETURN QUERY SELECT TRUE, 'Game ended successfully';
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Function to apply a referral code
CREATE OR REPLACE FUNCTION apply_referral_code(p_code VARCHAR(50), p_user_id UUID)
RETURNS TABLE(success BOOLEAN, message TEXT, bonus_awarded DECIMAL(10, 2), referrer_bonus DECIMAL(10, 2)) AS $$
DECLARE
  v_referral RECORD;
BEGIN
  -- Check if code exists
  SELECT * INTO v_referral FROM referrals WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Invalid referral code', 0::DECIMAL, 0::DECIMAL;
    RETURN;
  END IF;
  
  -- Check if user is trying to use their own code
  IF v_referral.user_id = p_user_id THEN
    RETURN QUERY SELECT FALSE, 'Cannot use your own referral code', 0::DECIMAL, 0::DECIMAL;
    RETURN;
  END IF;
  
  -- Check if user has already used a referral code
  IF EXISTS (SELECT 1 FROM referral_uses WHERE referred_user = p_user_id) THEN
    RETURN QUERY SELECT FALSE, 'User has already used a referral code', 0::DECIMAL, 0::DECIMAL;
    RETURN;
  END IF;
  
  -- Record the referral use
  INSERT INTO referral_uses (id, code, referred_user)
  VALUES (gen_random_uuid(), p_code, p_user_id);
  
  -- Award bonus to the referred user (100 Stars)
  UPDATE users SET balance_stars = balance_stars + 100 WHERE id = p_user_id;
  
  -- Record transaction for referred user
  INSERT INTO transactions (id, user_id, amount, type, description)
  VALUES (gen_random_uuid(), p_user_id, 100, 'referral', 'Bonus for using referral code ' || p_code);
  
  -- Award bonus to the referrer (20 Stars)
  UPDATE users SET balance_stars = balance_stars + v_referral.bonus_amount WHERE id = v_referral.user_id;
  
  -- Record transaction for referrer
  INSERT INTO transactions (id, user_id, amount, type, description)
  VALUES (
    gen_random_uuid(),
    v_referral.user_id,
    v_referral.bonus_amount,
    'referral',
    'Bonus for referral code use by user ' || LEFT(p_user_id::TEXT, 8) || '...'
  );
  
  RETURN QUERY SELECT TRUE, 'Referral code applied successfully', 100::DECIMAL, v_referral.bonus_amount;
  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically create a referral code for new users
CREATE OR REPLACE FUNCTION create_referral_code()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_random TEXT;
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  -- Generate a unique referral code
  v_prefix := UPPER(LEFT(NEW.username, 3));
  
  LOOP
    -- Generate random part
    v_random := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    v_code := v_prefix || v_random;
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM referrals WHERE code = v_code) INTO v_exists;
    IF NOT v_exists THEN
      EXIT;
    END IF;
  END LOOP;
  
  -- Insert the referral code
  INSERT INTO referrals (code, user_id, bonus_amount)
  VALUES (v_code, NEW.id, 20);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_referral_code_trigger
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION create_referral_code();

-- Create a view for leaderboard
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
  u.id,
  u.username,
  u.telegram_id,
  COUNT(DISTINCT g.id) as games_won,
  COALESCE(SUM(CASE WHEN t.type = 'payout' THEN t.amount ELSE 0 END), 0) as stars_won
FROM 
  users u
LEFT JOIN 
  games g ON u.id = g.winner_id
LEFT JOIN 
  transactions t ON t.user_id = u.id
GROUP BY 
  u.id, u.username, u.telegram_id
ORDER BY 
  stars_won DESC, games_won DESC;

-- Create a function to get user stats
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE(
  games_played BIGINT,
  games_won BIGINT,
  win_rate NUMERIC,
  total_earned NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(DISTINCT p.room_id)::BIGINT as games_played,
    COUNT(DISTINCT CASE WHEN g.winner_id = p_user_id THEN g.id END)::BIGINT as games_won,
    CASE 
      WHEN COUNT(DISTINCT p.room_id) > 0 THEN 
        ROUND((COUNT(DISTINCT CASE WHEN g.winner_id = p_user_id THEN g.id END)::NUMERIC / 
               COUNT(DISTINCT p.room_id)::NUMERIC) * 100)
      ELSE 0
    END as win_rate,
    COALESCE(SUM(CASE WHEN t.type = 'payout' THEN t.amount ELSE 0 END), 0) as total_earned
  FROM 
    participants p
  LEFT JOIN 
    games g ON p.room_id = g.room_id
  LEFT JOIN 
    transactions t ON t.user_id = p_user_id
  WHERE 
    p.user_id = p_user_id;
    
  RETURN;
END;
$$ LANGUAGE plpgsql;
