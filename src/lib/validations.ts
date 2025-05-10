import { z } from 'zod';

/**
 * Validation schema for room creation
 */
export const createRoomSchema = z.object({
  body: z.object({
    creator_id: z.string().uuid(),
    type: z.enum(['standard', 'bonus', 'hero']),
    entry_fee: z.number().positive(),
    max_players: z.number().int().min(2).max(10),
  }),
});

/**
 * Validation schema for joining a room
 */
export const joinRoomSchema = z.object({
  params: z.object({
    roomId: z.string().uuid(),
  }),
  body: z.object({
    user_id: z.string().uuid(),
  }),
});

/**
 * Validation schema for recording taps
 */
export const recordTapsSchema = z.object({
  params: z.object({
    gameId: z.string().uuid(),
  }),
  body: z.object({
    user_id: z.string().uuid(),
    count: z.number().int().positive().max(15), // Max 15 taps per request
  }),
});

/**
 * Validation schema for applying a referral code
 */
export const applyReferralSchema = z.object({
  body: z.object({
    code: z.string().regex(/^[A-Z0-9]{6,9}$/),
    user_id: z.string().uuid(),
  }),
});

/**
 * Validation schema for user initialization
 */
export const userInitSchema = z.object({
  body: z.object({
    telegram_id: z.number().int().positive(),
    username: z.string().optional(),
    photo_url: z.string().url().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
});

/**
 * Validation schema for TON wallet connection
 */
export const connectWalletSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
  body: z.object({
    ton_address: z.string().regex(/^[a-zA-Z0-9_-]{48}$/),
  }),
});

/**
 * Validation schema for Stars to TON conversion
 */
export const convertStarsSchema = z.object({
  body: z.object({
    user_id: z.string().uuid(),
    amount: z.number().int().positive(),
  }),
});

/**
 * Validation schema for room key
 */
export const roomKeySchema = z.object({
  body: z.object({
    room_key: z.string().regex(/^[A-Z0-9]{6}$/),
  }),
});

export default {
  createRoomSchema,
  joinRoomSchema,
  recordTapsSchema,
  applyReferralSchema,
  userInitSchema,
  connectWalletSchema,
  convertStarsSchema,
  roomKeySchema,
};
