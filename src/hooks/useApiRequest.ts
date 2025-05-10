import { useState, useCallback } from 'react';
import { useTelegram } from './useTelegram';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  token?: string;
}

export function useApiRequest() {
  const { user } = useTelegram();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Базовый URL API
  const API_BASE_URL = (() => {
    // Если задан VITE_API_URL в .env, используем его
    if (import.meta.env.VITE_API_URL) {
      console.log(
        'useApiRequest: Используем API URL из .env:',
        import.meta.env.VITE_API_URL
      );
      return import.meta.env.VITE_API_URL;
    }

    // Если запущено в Telegram WebApp или на production
    if (window.Telegram?.WebApp || window.location.hostname !== 'localhost') {
      // В production или Telegram WebApp используем относительные пути
      console.log('useApiRequest: Используем относительные пути для API');
      return '';
    }

    // Для локальной разработки
    console.log(
      'useApiRequest: Локальная разработка, используем localhost:3001'
    );
    return 'http://localhost:3001';
  })();

  const fetchData = useCallback(
    async <T = any>(
      endpoint: string,
      options: RequestInit = {}
    ): Promise<ApiResponse<T>> => {
      setIsLoading(true);
      setError(null);

      try {
        // Текущий JWT из localStorage
        const token = localStorage.getItem('authToken');

        // Заголовки запроса
        const headers: Record<string, string> = {
          ...((options.headers as Record<string, string>) || {}),
          'Content-Type': 'application/json',
        };

        // Добавляем JWT
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          console.log('Добавлен токен авторизации в заголовки');
        }

        // Добавляем Telegram ID
        if (user?.id) {
          headers['X-User-ID'] = user.id.toString();
          console.log(`Добавлен X-User-ID в заголовки: ${user.id}`);
        }

        // Добавляем Telegram WebApp initData, если доступно
        if (window.Telegram?.WebApp?.initData) {
          headers['X-Telegram-Init-Data'] = window.Telegram.WebApp.initData;
          console.log('Добавлен X-Telegram-Init-Data в заголовки');
        }

        // Формируем URL
        const url = endpoint.startsWith('http')
          ? endpoint
          : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

        console.log(`Отправка запроса: ${options.method || 'GET'} ${url}`);
        const response = await fetch(url, { ...options, headers });
        console.log(`Получен ответ: ${response.status} ${response.statusText}`);

        // Сохраняем токен из заголовка, если есть
        const newHeaderToken = response.headers.get('X-Auth-Token');
        if (newHeaderToken) {
          localStorage.setItem('authToken', newHeaderToken);
          console.log('Получен и сохранен токен из заголовка');
        }

        // Парсим тело ответа
        let parsed: any;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          parsed = await response.json();
          // Сохраняем токен из тела ответа, если есть
          if (parsed && typeof parsed === 'object' && 'token' in parsed) {
            localStorage.setItem('authToken', (parsed as any).token);
            console.log('Получен и сохранен токен из тела ответа');
          }
        } else {
          const text = await response.text();
          console.warn('Получен не JSON ответ:', text);
          parsed = { message: text };
        }

        if (!response.ok) {
          const errMsg = parsed?.message || response.statusText;
          console.error(`Ошибка ${response.status}:`, errMsg);
          throw new Error(errMsg);
        }

        // Выделяем coreData
        const coreData =
          parsed && typeof parsed === 'object' && 'data' in parsed
            ? (parsed as any).data
            : parsed;

        return {
          success: true,
          data: coreData,
          ...(parsed && typeof parsed === 'object' && 'token' in parsed
            ? { token: (parsed as any).token }
            : {}),
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Неизвестная ошибка';
        setError(message);
        console.error('Ошибка запроса API:', err);
        return { success: false, message };
      } finally {
        setIsLoading(false);
      }
    },
    [API_BASE_URL, user]
  );

  return { fetchData, isLoading, error };
}

export default useApiRequest;
