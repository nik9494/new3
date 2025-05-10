import { useState, useEffect } from 'react';
import useTelegramWebApp from './useTelegramWebApp';
import { userApi } from '../services/api';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface AppUser {
  id: string;
  telegram_id: number;
  username: string;
  balance_stars: number;
  has_ton_wallet: boolean;
}

// Определение типов для ответов API
interface ApiResponse<T> {
  success: boolean;
  data: T;
  token?: string;
  message?: string;
}

interface UserApiResponse {
  user: AppUser;
  wallet?: any;
  stats?: any;
  referral?: any;
}

export function useTelegram() {
  // Используем улучшенный хук WebApp
  const {
    user: webAppUser,
    isReady: webAppReady,
    webApp,
  } = useTelegramWebApp();
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Инициализируем пользователя с бэкендом, когда Telegram WebApp готов
  useEffect(() => {
    const initializeUser = async () => {
      // Режим Telegram WebApp
      if (window.Telegram?.WebApp) {
        if (webAppReady && webAppUser && !isInitializing) {
          setIsInitializing(true);
          setError(null);

          try {
            console.log('Инициализация пользователя с данными Telegram:', {
              id: webAppUser.id,
              username: webAppUser.username,
              first_name: webAppUser.first_name,
              last_name: webAppUser.last_name,
            });

            // Сначала устанавливаем пользователя Telegram
            setUser(webAppUser);

            // Проверяем, существует ли пользователь в базе данных
            try {
              console.log(
                'Проверка существования пользователя по Telegram ID:',
                webAppUser.id
              );

              // Добавляем обработку ошибок и повторные попытки
              let existingUser = null;
              let retryCount = 0;
              const maxRetries = 3;

              while (retryCount < maxRetries) {
                try {
                  existingUser = (await userApi.getUserByTelegramId(
                    webAppUser.id
                  )) as ApiResponse<UserApiResponse>;
                  break; // Если запрос успешен, выходим из цикла
                } catch (retryError) {
                  retryCount++;
                  console.log(
                    `Попытка ${retryCount}/${maxRetries} не удалась:`,
                    retryError
                  );
                  if (retryCount >= maxRetries) throw retryError;
                  // Ждем перед следующей попыткой (экспоненциальная задержка)
                  await new Promise(resolve =>
                    setTimeout(resolve, 1000 * Math.pow(2, retryCount))
                  );
                }
              }

              if (existingUser && existingUser.success && existingUser.data) {
                console.log(
                  'Пользователь найден в базе данных:',
                  existingUser.data
                );

                // Если пользователь найден, сохраняем его данные
                if (existingUser.data.user) {
                  setAppUser(existingUser.data.user);

                  // Сохраняем ID пользователя в localStorage
                  if (existingUser.data.user.id) {
                    localStorage.setItem('userId', existingUser.data.user.id);
                    console.log(
                      'ID пользователя сохранен в localStorage:',
                      existingUser.data.user.id
                    );
                  }

                  // Сохраняем токен, если он есть
                  if (existingUser.token) {
                    localStorage.setItem('authToken', existingUser.token);
                    console.log('JWT токен сохранен в localStorage');
                  }

                  setIsReady(true);
                  setIsInitializing(false);
                  return;
                }
              }
            } catch (existingUserError) {
              console.log(
                'Пользователь не найден в базе данных или произошла ошибка:',
                existingUserError
              );
              // Продолжаем с созданием нового пользователя
            }

            // Если пользователь не найден, инициализируем нового
            try {
              console.log('Инициализация нового пользователя через API:', {
                baseUrl: import.meta.env.VITE_API_URL || 'default',
                hostname: window.location.hostname,
                origin: window.location.origin,
              });
              const response = (await userApi.initUser({
                telegram_id: webAppUser.id,
                username: webAppUser.username,
                first_name: webAppUser.first_name,
                last_name: webAppUser.last_name,
                photo_url: webAppUser.photo_url,
              })) as ApiResponse<UserApiResponse>;

              console.log('Ответ инициализации бэкенда:', response);

              if (response && response.success && response.data?.user) {
                setAppUser(response.data.user);

                // Сохраняем JWT токен и ID пользователя, если они предоставлены
                if (response.token) {
                  localStorage.setItem('authToken', response.token);
                  console.log('JWT токен сохранен в localStorage');
                }
                if (response.data.user.id) {
                  localStorage.setItem('userId', response.data.user.id);
                  console.log(
                    'ID пользователя сохранен в localStorage:',
                    response.data.user.id
                  );
                }

                setIsReady(true);
                console.log(
                  'Пользователь инициализирован с бэкендом:',
                  response.data.user
                );
              } else {
                setError(
                  'Не удалось инициализировать пользователя: неверный формат ответа'
                );
                console.error(
                  'Ошибка инициализации пользователя: неверный формат ответа',
                  response
                );
              }
            } catch (apiError) {
              setError(
                apiError instanceof Error
                  ? apiError.message
                  : 'Ошибка запроса API'
              );
              console.error(
                'Ошибка API при инициализации пользователя:',
                apiError
              );
            }
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
            console.error('Исключение при инициализации пользователя:', err);
          } finally {
            setIsInitializing(false);
          }
        }
      }
      // Режим прямой ссылки (без Telegram)
      else {
        console.log('Режим прямой ссылки: проверка localStorage');
        
        const userId = localStorage.getItem('userId');
        const authToken = localStorage.getItem('authToken');
        
        // Если есть сохраненный пользователь - загружаем
        if (userId && authToken) {
          try {
            const response = await userApi.getUserProfile(userId);
            setAppUser(response.data);
          } catch (err) {
            localStorage.removeItem('userId');
            localStorage.removeItem('authToken');
          }
        }
        
        // Если нет - создаем тестового
        else {
          console.log('Создание тестового пользователя...');
          const testUser = {
            id: 12345678,
            username: 'testuser',
            first_name: 'Test',
            photo_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TestUser'
          };
          setUser(testUser);
          setAppUser(testUser as any);
        }
      }
      
      setIsReady(true);
    };

    initializeUser();
  }, [webAppReady, webAppUser, isInitializing]);

  // Предоставляем экземпляр WebApp для прямого доступа к методам Telegram
  return {
    user,
    appUser,
    isReady,
    isInitializing,
    error,
    webApp,
  };
}

export default useTelegram;