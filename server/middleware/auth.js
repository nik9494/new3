import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

// Секрет для JWT. Задайте в .env как JWT_SECRET, иначе будет использован дефолт.
const JWT_SECRET =
  process.env.JWT_SECRET ||
  '5f2b1a8c3e4d6f9a7c0b2e1f8d4c6a0e3b5f7c1d9e2a4b6c8d0f2e4a6b8c0e2';
// Время жизни токена (например, 1 час)
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

/**
 * Глобальный rate limiter для всех запросов.
 * @param {{ windowMs: number, max: number }} options
 * @returns Express middleware
 */
export const apiRateLimit = options => {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15 минут по умолчанию
    max: options.max || 100, // 100 запросов по умолчанию
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Слишком много запросов - попробуйте позже.' },
    keyGenerator: req => req.headers['cf-connecting-ip'] || req.ip,
    skip: req => {
      // Пропускаем проверку для критических эндпоинтов
      const criticalEndpoints = ['/api/users/init', '/api/users/telegram'];

      // Проверяем, начинается ли URL с одного из критических эндпоинтов
      return criticalEndpoints.some(endpoint => req.url.startsWith(endpoint));
    },
  });
};

/**
 * Rate limiter для endpoint'ов с тапами (ограничение быстрее)
 * @returns Express middleware
 */
export const tapRateLimit = () => {
  return rateLimit({
    windowMs: 60 * 1000, // 1 минута
    max: 20, // не более 20 запросов за минуту
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Слишком много тапов - подождите минуту.' },
  });
};

/**
 * Middleware-заглушка для детекции VPN/Proxy.
 * Для реальной проверки используйте внешний сервис.
 */
export const detectVPN = () => {
  return async (req, res, next) => {
    try {
      const ip =
        req.ip ||
        req.headers['x-forwarded-for'] ||
        req.connection?.remoteAddress;
      // Здесь можно добавить проверку IP на VPN/Proxy, например:
      // const resp = await fetch(`https://vpn-check.example.com/api?ip=${ip}`);
      // const data = await resp.json();
      // if (data.isVpn) {
      //   return res.status(403).json({ error: 'Доступ через VPN/Proxy запрещён.' });
      // }
      next();
    } catch (err) {
      console.error('Ошибка в detectVPN:', err);
      next();
    }
  };
};

/**
 * Генерация JWT-токена с заданным payload.
 * @param {Object} payload - данные для включения в токен
 * @returns {string} - подписанный JWT
 */
export const generateToken = payload => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Middleware для верификации JWT-токена из заголовка Authorization: Bearer <token>.
 */
export const verifyJWT = () => {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Токен не предоставлен.' });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      return res
        .status(401)
        .json({ error: 'Неверный или просроченный токен.' });
    }
  };
};
