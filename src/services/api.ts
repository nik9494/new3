

/**
 * API Service for TapBattle Backend
 *
 * This module provides functions to interact with the Express.js backend API.
 * It handles:
 *  - Building request URLs
 *  - Setting headers (Content-Type, Telegram init data, JWT, User ID)
 *  - Parsing JSON responses and error handling
 *  - Storing JWT and User ID in localStorage
 */

/**
 * Дополнение к файлу api.ts - типизация ответов API
 */

// Функция для debounce запросов
const debounce = <T extends (...args: any[]) => Promise<any>>(
  fn: T,
  delay: number
) => {
  let timer: NodeJS.Timeout;
  return (...args: Parameters<T>): ReturnType<T> => {
    clearTimeout(timer);
    return new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        fn(...args)
          .then(resolve)
          .catch(reject);
      }, delay);
    }) as ReturnType<T>;
  };
};

// Кэш для предотвращения дублирующих запросов
interface RequestCache {
  [key: string]: {
    promise: Promise<any>;
    timestamp: number;
  };
}

// Инициализируем кэш из localStorage или создаем новый
let requestCache: RequestCache = {};
const CACHE_TTL = 2000; // 2 секунды

// Отслеживаем активные запросы для предотвращения дублирования
const activeRequests: Set<string> = new Set();

// Функция для очистки всего кэша
const clearCache = (): void => {
  requestCache = {};
  activeRequests.clear();
  console.log('Кэш API запросов очищен');
};

// Экспортируем функцию очистки кэша
export const clearApiCache = clearCache;

// Функция для создания ключа кэша
const createCacheKey = (endpoint: string, options: RequestInit): string => {
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : '';
  return `${method}:${endpoint}:${body}`;
};

// Проверка, нужно ли пропустить кэширование для критических эндпоинтов
const shouldSkipCache = (endpoint: string): boolean => {
  const criticalEndpoints = [
    '/users/telegram/',
    '/users/init',
    '/users/profile',
    '/users/',
  ];

  return criticalEndpoints.some(critical => endpoint.includes(critical));
};

// Функция для отмены дублирующих запросов
const cancelDuplicateRequests = (cacheKey: string): void => {
  if (activeRequests.has(cacheKey)) {
    console.log(`Дублирующий запрос предотвращен: ${cacheKey}`);
    throw new Error('Запрос уже выполняется');
  }
};

// Функция для очистки устаревших записей кэша
const cleanupCache = (): void => {
  const now = Date.now();
  Object.keys(requestCache).forEach(key => {
    if (now - requestCache[key].timestamp > CACHE_TTL) {
      delete requestCache[key];
    }
  });
};

// Запускаем периодическую очистку кэша
setInterval(cleanupCache, CACHE_TTL);

// Общий интерфейс для всех ответов API
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  token?: string;
  message?: string;
}

// Интерфейс для инициализации пользователя
export interface InitUserParams {
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
}

// Универсальные типы для response.data в разных ответах API
export interface UserResponseData {
  user: User;
  wallet?: any;
  stats?: any;
  referral?: any;
}

import { getTelegramWebApp } from './telegramSDK';

// Data types
export interface User {
  id: string;
  telegram_id: number;
  username: string;
  balance_stars: number;
  has_ton_wallet: boolean;
  photo_url?: string;
}

export interface Room {
  id: string;
  creator_id: string;
  type: 'standard' | 'bonus' | 'hero';
  entry_fee: number;
  max_players: number;
  status: 'waiting' | 'active' | 'finished';
  room_key?: string;
  created_at?: string;
}

export interface Participant {
  id: string;
  user_id: string;
  room_id: string;
  joined_at: string;
  username: string;
  photo_url?: string;
}

export interface Game {
  id: string;
  room_id: string;
  status: string;
  start_time?: string;
  end_time?: string;
  winner_id?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'entry' | 'payout' | 'fee' | 'referral';
  description?: string;
  created_at?: string;
}

// Интерфейс для ответа метода observeRoom
export interface ObserveRoomResponse {
  room: {
    id: string;
    creator_id: string;
    type: 'hero' | 'standard' | 'bonus';
    status: 'waiting' | 'active' | 'finished';
    entry_fee: number;
    max_players: number;
    room_key?: string;
    created_at: string;
    time_left_seconds: number;
  };
  participants: Participant[];
}

// Base URL configuration
const API_BASE_URL = (() => {
  // Если задан VITE_API_URL в .env, используем его
  if (import.meta.env.VITE_API_URL) {
    console.log('Используем API URL из .env:', import.meta.env.VITE_API_URL);
    return import.meta.env.VITE_API_URL + '/api';
  }

  // Если запущено в Telegram WebApp
  if (window.Telegram?.WebApp) {
    // Используем тот же домен, что и у приложения
    console.log(
      'Запущено в Telegram WebApp, используем текущий origin:',
      window.location.origin
    );
    return window.location.origin + '/api';
  }

  // Для локальной разработки
  if (window.location.hostname === 'localhost') {
    console.log('Локальная разработка, используем localhost:3001');
    return 'http://localhost:3001/api';
  }

  // Для всех остальных случаев используем текущий origin
  console.log('Используем текущий origin:', window.location.origin);
  return window.location.origin + '/api';
})();

/**
 * Build headers for API requests
 */
function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Telegram WebApp init data
  const webApp = getTelegramWebApp();
  if (webApp?.initData) {
    headers['X-Telegram-Init-Data'] = webApp.initData;
  }

  // Fallback user ID
  const userId = localStorage.getItem('userId');
  if (userId) {
    headers['X-User-ID'] = userId;
  }

  // JWT auth token
  const authToken = localStorage.getItem('authToken');
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return headers;
}

/**
 * Base fetch function without debounce
 */
async function baseFetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = { ...getHeaders(), ...(options.headers ?? {}) };
  const method = options.method || 'GET';

  // Создаем ключ кэша для всех запросов (для отслеживания дублирования)
  const cacheKey = createCacheKey(endpoint, options);

  // Для GET запросов используем кэширование и дедупликацию, если это не критический эндпоинт
  if (method === 'GET' && !shouldSkipCache(endpoint)) {
    // Если запрос уже выполняется, возвращаем существующий промис
    if (
      requestCache[cacheKey] &&
      Date.now() - requestCache[cacheKey].timestamp < CACHE_TTL
    ) {
      console.log(`Используем кэшированный запрос для: ${method} ${endpoint}`);
      return requestCache[cacheKey].promise;
    }

    // Проверяем, не выполняется ли уже такой же запрос
    if (activeRequests.has(cacheKey)) {
      console.log(`Запрос уже выполняется, ожидаем: ${method} ${endpoint}`);
      // Создаем новый промис, который разрешится, когда активный запрос завершится
      return new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          if (!activeRequests.has(cacheKey) && requestCache[cacheKey]) {
            clearInterval(checkInterval);
            resolve(requestCache[cacheKey].promise);
          } else if (!activeRequests.has(cacheKey)) {
            clearInterval(checkInterval);
            reject(new Error('Запрос был отменен'));
          }
        }, 100);
      });
    }

    // Отмечаем запрос как активный
    activeRequests.add(cacheKey);

    // Создаем новый запрос и сохраняем его в кэше
    const promise = (async () => {
      try {
        console.log(`API Request: ${method} ${endpoint}`);

        const response = await fetch(url, {
          ...options,
          headers,
        });

        // Log response status
        console.log(
          `API Response: ${response.status} ${response.statusText} for ${endpoint}`
        );

        let payload;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          payload = await response.json();
        } else {
          const text = await response.text();
          console.warn('Non-JSON response:', text);
          payload = { message: text };
        }

        if (!response.ok) {
          console.error('API Error:', payload);
          throw new Error(payload.message || `Error ${response.status}`);
        }

        // Save new JWT token from response header if provided
        const newToken = response.headers.get('X-Auth-Token');
        if (newToken) {
          localStorage.setItem('authToken', newToken);
          console.log('New auth token received and stored');
        }

        return payload as T;
      } catch (error) {
        console.error(`API Error for ${endpoint}:`, error);
        // Удаляем запрос из кэша при ошибке
        delete requestCache[cacheKey];
        throw error;
      } finally {
        // Удаляем запрос из списка активных
        activeRequests.delete(cacheKey);
      }
    })();

    // Сохраняем промис в кэше
    requestCache[cacheKey] = {
      promise: promise,
      timestamp: Date.now(),
    };

    return promise;
  }

  // Для не-GET запросов или критических эндпоинтов
  console.log(`API Request: ${method} ${endpoint}`);

  // Проверяем, не выполняется ли уже такой же запрос
  if (activeRequests.has(cacheKey)) {
    console.log(`Дублирующий запрос предотвращен: ${method} ${endpoint}`);
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (!activeRequests.has(cacheKey) && requestCache[cacheKey]) {
          clearInterval(checkInterval);
          resolve(requestCache[cacheKey].promise);
        } else if (!activeRequests.has(cacheKey)) {
          clearInterval(checkInterval);
          reject(new Error('Запрос был отменен'));
        }
      }, 100);
    });
  }

  // Отмечаем запрос как активный
  activeRequests.add(cacheKey);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Log response status
    console.log(
      `API Response: ${response.status} ${response.statusText} for ${endpoint}`
    );

    let payload;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      const text = await response.text();
      console.warn('Non-JSON response:', text);
      payload = { message: text };
    }

    if (!response.ok) {
      console.error('API Error:', payload);
      throw new Error(payload.message || `Error ${response.status}`);
    }

    // Save new JWT token from response header if provided
    const newToken = response.headers.get('X-Auth-Token');
    if (newToken) {
      localStorage.setItem('authToken', newToken);
      console.log('New auth token received and stored');
    }

    // Сохраняем результат в кэше для возможного использования
    if (method === 'GET') {
      requestCache[cacheKey] = {
        promise: Promise.resolve(payload as T),
        timestamp: Date.now(),
      };
    }

    return payload as T;
  } catch (error) {
    console.error(`API Error for ${endpoint}:`, error);
    throw error;
  } finally {
    // Удаляем запрос из списка активных
    activeRequests.delete(cacheKey);
  }
}

// Создаем debounced версию нашей функции fetch
const debouncedFetch = debounce(baseFetchApi, 300) as typeof baseFetchApi;

/**
 * Generic fetch wrapper with debounce
 * @param endpoint Path relative to API_BASE_URL (e.g. '/users/init')
 * @param options Fetch options (method, body, etc.)
 * @returns Parsed JSON response
 */
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  return debouncedFetch<T>(endpoint, options);
}

/**
 * Fetch API without debounce (для критических запросов)
 * @param endpoint Path relative to API_BASE_URL
 * @param options Fetch options
 * @returns Parsed JSON response
 */
export async function fetchApiWithoutDebounce<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  return baseFetchApi<T>(endpoint, options);
}

// User API endpoints
export const userApi = {
  /**
   * Fetch user by Telegram ID
   */
  getUserByTelegramId: (
    telegramId: number
  ): Promise<ApiResponse<UserResponseData>> => {
    console.log(`Запрос пользователя по Telegram ID: ${telegramId}`);
    return fetchApi<ApiResponse<UserResponseData>>(
      `/users/telegram/${telegramId}`
    );
  },

  /**
   * Fetch user by Telegram ID without cache
   */
  getUserByTelegramIdWithoutCache: (
    telegramId: number
  ): Promise<ApiResponse<UserResponseData>> => {
    console.log(`Запрос пользователя по Telegram ID без кэша: ${telegramId}`);
    return fetchApiWithoutDebounce<ApiResponse<UserResponseData>>(
      `/users/telegram/${telegramId}`
    );
  },

  /**
   * Fetch profile of authenticated user without cache
   */
  getUserProfileWithoutCache: (userId: string): Promise<ApiResponse<User>> => {
    console.log(`Запрос профиля пользователя без кэша: ${userId}`);
    return fetchApiWithoutDebounce<ApiResponse<User>>(`/users/${userId}`);
  },

  /**
   * Initialize or get current user via Telegram WebApp data
   * Stores userId and authToken in localStorage
   */
  initUser: async (
    tg: InitUserParams
  ): Promise<ApiResponse<UserResponseData>> => {
    console.log('Initializing user with data:', tg);

    // Шаг 1. Получаем «сырые» данные от сервера - используем без debounce для инициализации
    const payload = await fetchApiWithoutDebounce<any>('/users/init', {
      method: 'POST',
      body: JSON.stringify({
        telegram_id: tg.telegram_id,
        username: tg.username,
        first_name: tg.first_name,
        last_name: tg.last_name,
        photo_url: tg.photo_url,
      }),
    });
    console.log('Raw initUser payload:', payload);

    // Шаг 2. Нормализуем под ApiResponse<UserResponseData>
    const normalized: ApiResponse<UserResponseData> = {
      success: payload.success,
      message: payload.message,
      token: payload.token,
      data: {
        // если payload.data.user есть — берём его,
        // иначе оборачиваем payload.user
        user: payload.data?.user ?? payload.user,
        wallet: payload.data?.wallet,
        stats: payload.data?.stats,
        referral: payload.data?.referral,
      },
    };

    // Шаг 3. Сохраняем в localStorage
    if (normalized.data.user.id) {
      localStorage.setItem('userId', normalized.data.user.id);
      console.log('User ID stored in localStorage:', normalized.data.user.id);
    }
    if (normalized.token) {
      localStorage.setItem('authToken', normalized.token);
      console.log('Auth token stored in localStorage');
    }

    // Шаг 4. Возвращаем уже унифицированный ответ
    return normalized;
  },

  /**
   * Initialize user without cache
   */
  initUserWithoutCache: async (
    tg: InitUserParams
  ): Promise<ApiResponse<UserResponseData>> => {
    console.log('Инициализация пользователя без кэша:', tg);

    // Очищаем кэш перед запросом
    localStorage.removeItem('api_cache');

    // Отправляем запрос без использования кэша
    const payload = await fetchApiWithoutDebounce<any>('/users/init', {
      method: 'POST',
      body: JSON.stringify({
        telegram_id: tg.telegram_id,
        username: tg.username || `User_${tg.telegram_id}`,
        first_name: tg.first_name,
        last_name: tg.last_name,
        photo_url: tg.photo_url,
      }),
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });

    console.log('Ответ инициализации без кэша:', payload);

    // Нормализуем ответ
    const normalized: ApiResponse<UserResponseData> = {
      success: payload.success,
      message: payload.message,
      token: payload.token,
      data: {
        user: payload.data?.user ?? payload.user,
        wallet: payload.data?.wallet,
        stats: payload.data?.stats,
        referral: payload.data?.referral,
      },
    };

    // Сохраняем в localStorage
    if (normalized.data?.user?.id) {
      localStorage.setItem('userId', normalized.data.user.id);
      console.log(
        'ID пользователя сохранен в localStorage:',
        normalized.data.user.id
      );
    }

    if (normalized.token) {
      localStorage.setItem('authToken', normalized.token);
      console.log('Токен авторизации сохранен в localStorage');
    }

    return normalized;
  },

  /**
   * Fetch profile of authenticated user
   */
  getUserProfile: (userId: string): Promise<ApiResponse<User>> =>
    fetchApi<ApiResponse<User>>(`/users/${userId}`),

  /**
   * Connect TON wallet for user
   */
  connectWallet: (userId: string, tonAddress: string) =>
    fetchApiWithoutDebounce<any>(`/users/${userId}/wallet`, {
      method: 'POST',
      body: JSON.stringify({ ton_address: tonAddress }),
    }),
};

// Стандартные комнаты
export const standardApi = {
  list: () =>
    fetchApi<Room[]>(`/rooms/standard`),
  get: (id: string) =>
    fetchApi<Room & { participants: Participant[] }>(`/rooms/standard/${id}`),
  joinOrCreate: (entryFee: number) =>
    fetchApiWithoutDebounce<{
      message: string;
      roomId: string;
      gameStarting: boolean;
    }>(`/rooms/standard/join`, {
      method: 'POST',
      body: JSON.stringify({ entry_fee: entryFee }),
    }),
  startGame: (roomId: string, secretKey: string) =>
    fetchApiWithoutDebounce<any>(`/rooms/standard/${roomId}/start-game`, {
      method: 'POST',
      body: JSON.stringify({ secret_key: secretKey }),
    }),
  finishGame: (roomId: string, winnerId: string, secretKey: string) =>
    fetchApiWithoutDebounce<any>(`/rooms/standard/${roomId}/finish-game`, {
      method: 'POST',
      body: JSON.stringify({ winner_id: winnerId, secret_key: secretKey }),
    }),
  leave: (roomId: string) =>
    fetchApiWithoutDebounce<any>(`/rooms/standard/${roomId}/leave`, {
      method: 'POST',
    }),
  status: (roomId: string) =>
    fetchApi<any>(`/rooms/standard/${roomId}/status`),
};

// Hero-комнаты
export const heroApi = {
  list: () =>
    fetchApi<Array<Room & { player_count: number; room_key?: string }>>(`/rooms/hero`),
  get: (id: string) =>
    fetchApiWithoutDebounce<ObserveRoomResponse>(`/rooms/hero/${id}/observe`, {
      method: 'GET',
    }),
  /** Создать новую Hero-комнату. Возвращает объект с id и room_key */
  create: (entryFee: number) =>
    fetchApiWithoutDebounce<{
      id: string;
      room_key: string;
      creator_id: string;
      type: 'hero';
      entry_fee: number;
      max_players: number;
      status: 'waiting' | 'active' | 'finished';
      created_at?: string;
    }>(`/rooms/hero`, {
      method: 'POST',
      body: JSON.stringify({ entry_fee: entryFee }),
    }),
  joinByKey: (key: string) =>
    fetchApiWithoutDebounce<{ participant: Participant; room: Room }>(
      `/rooms/hero/join-by-key`,
      { method: 'POST', body: JSON.stringify({ room_key: key }) }
    ),
  observe: (roomId: string) =>
    fetchApiWithoutDebounce<ObserveRoomResponse>(
      `/rooms/hero/${roomId}/observe`,
      { method: 'GET' }
    ),
  delete: (roomId: string) =>
    fetchApiWithoutDebounce<any>(`/rooms/hero/${roomId}`, {
      method: 'DELETE',
    }),
  startGame: (roomId: string, secretKey: string) =>
    fetchApiWithoutDebounce<any>(`/rooms/hero/${roomId}/start-game`, {
      method: 'POST',
      body: JSON.stringify({ secret_key: secretKey }),
    }),
};

// Game API endpoints
export const gameApi = {
  /**
   * Get current game state for a room
   */
  getGameForRoom: (roomId: string) => fetchApi<Game>(`/games/room/${roomId}`),

  /**
   * Record tap count for a game
   */
  recordTaps: (gameId: string, userId: string, count: number) =>
    fetchApiWithoutDebounce<any>(`/games/${gameId}/taps`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, count }),
    }),

  /**
   * End the game and distribute rewards
   */
  endGame: (gameId: string) =>
    fetchApiWithoutDebounce<Game>(`/games/${gameId}/end`, { method: 'POST' }),
};

// Transaction API endpoints
export const transactionApi = {
  /**
   * Get transactions for a user
   */
  getUserTransactions: (userId: string, limit = 20, offset = 0) =>
    fetchApi<Transaction[]>(
      `/transactions/user/${userId}?limit=${limit}&offset=${offset}`
    ),

  /**
   * Create a new transaction (entry, payout, fee, referral)
   */
  createTransaction: (
    userId: string,
    amount: number,
    type: 'entry' | 'payout' | 'fee' | 'referral',
    description?: string
  ) =>
    fetchApiWithoutDebounce<any>('/transactions', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, amount, type, description }),
    }),

  /**
   * Telegram payment processing endpoint
   */
  processTelegramPayment: (
    telegramId: number,
    amount: number,
    paymentId: string
  ) =>
    fetchApiWithoutDebounce<any>('/transactions/telegram-payment', {
      method: 'POST',
      body: JSON.stringify({
        telegram_id: telegramId,
        amount,
        payment_id: paymentId,
      }),
    }),

  /**
   * Withdraw Stars to TON wallet
   */
  withdrawToTON: (userId: string, amount: number) =>
    fetchApiWithoutDebounce<any>('/transactions/withdraw-ton', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, amount }),
    }),
};

// Referral API endpoints
export const referralApi = {
  /**
   * Get referral code for a user
   */
  getUserReferralCode: (userId: string) =>
    fetchApi<any>(`/referrals/user/${userId}`),

  /**
   * Get referral usage history
   */
  getReferralUses: (userId: string) =>
    fetchApi<any>(`/referrals/user/${userId}/uses`),

  /**
   * Apply a referral code
   */
  applyReferralCode: (code: string, userId: string) =>
    fetchApiWithoutDebounce<any>('/referrals/apply', {
      method: 'POST',
      body: JSON.stringify({ code, user_id: userId }),
    }),

  /**
   * Generate a referral code for a user
   */
  generateReferralCode: (userId: string) =>
    fetchApiWithoutDebounce<any>('/referrals/generate', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),
};

// Bonus API endpoints
export const bonusApi = {
  getBonusProgress: (userId: string) => fetchApi<any>(`/bonus/user/${userId}`),
  startBonusChallenge: (userId: string) =>
    fetchApiWithoutDebounce<any>('/bonus/start', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),
  recordBonusTaps: (userId: string, taps: number) =>
    fetchApiWithoutDebounce<any>('/bonus/taps', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, taps }),
    }),
  resetBonusChallenge: (userId: string) =>
    fetchApiWithoutDebounce<any>('/bonus/reset', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),
};

// Leaderboard API endpoints
export const leaderboardApi = {
  getLeaderboard: (
    period: 'day' | 'week' | 'month' | 'all' = 'day',
    limit = 10,
    offset = 0
  ) =>
    fetchApi<any[]>(
      `/leaderboard?period=${period}&limit=${limit}&offset=${offset}`
    ),
  getUserRank: (
    userId: string,
    period: 'day' | 'week' | 'month' | 'all' = 'day'
  ) => fetchApi<any>(`/leaderboard/user/${userId}?period=${period}`),
};
