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
    console.log('useTelegram useEffect запущен, состояние:', {
      webAppReady,
      webAppUser: webAppUser
        ? `${webAppUser.username} (${webAppUser.id})`
        : 'нет',
      isInitializing,
      isReady,
      appUser: appUser ? `${appUser.username} (${appUser.id})` : 'нет',
    });

    // Предотвращаем повторную инициализацию
    if (isInitializing) {
      console.log('Инициализация уже выполняется, пропускаем');
      return;
    }

    // Если пользователь уже готов, не делаем ничего
    if (isReady && appUser) {
      console.log('Пользователь уже инициализирован:', appUser.username);
      return;
    }

    // Функция инициализации пользователя
    const initializeUser = async () => {
      console.log('Запуск initializeUser');
      setIsInitializing(true);
      setError(null);

      try {
        // Режим Telegram WebApp
        if (window.Telegram?.WebApp && webAppReady && webAppUser) {
          console.log('Режим Telegram WebApp, пользователь:', {
            id: webAppUser.id,
            username: webAppUser.username,
          });

          // Устанавливаем пользователя Telegram
          setUser(webAppUser);

          // Очищаем кэш запросов перед запросом пользователя
          localStorage.removeItem('api_cache');

          // Проверяем, существует ли пользователь в базе данных
          try {
            console.log('Запрос пользователя по Telegram ID:', webAppUser.id);

            // Используем fetchApiWithoutDebounce для гарантированного запроса без кэширования
            const existingUserResponse =
              await userApi.getUserByTelegramIdWithoutCache(webAppUser.id);
            console.log(
              'Ответ API для пользователя Telegram:',
              existingUserResponse
            );

            if (
              existingUserResponse?.success &&
              existingUserResponse?.data?.user
            ) {
              const userData = existingUserResponse.data.user;
              console.log('Пользователь найден в базе данных:', userData);

              // Сохраняем данные пользователя
              setAppUser(userData);

              // Сохраняем ID пользователя в localStorage
              localStorage.setItem('userId', userData.id);

              // Сохраняем токен, если он есть
              if (existingUserResponse.token) {
                localStorage.setItem('authToken', existingUserResponse.token);
              }

              setIsReady(true);
              setIsInitializing(false);
              return;
            } else {
              console.log('Пользователь не найден или неверный формат ответа');
            }
          } catch (existingUserError) {
            console.error(
              'Ошибка при запросе пользователя:',
              existingUserError
            );
            // Продолжаем с созданием нового пользователя
          }

          // Если пользователь не найден, инициализируем нового
          try {
            console.log('Инициализация нового пользователя через API');

            const initResponse = await userApi.initUserWithoutCache({
              telegram_id: webAppUser.id,
              username: webAppUser.username || `User_${webAppUser.id}`,
              first_name: webAppUser.first_name,
              last_name: webAppUser.last_name,
              photo_url: webAppUser.photo_url,
            });

            console.log('Ответ инициализации:', initResponse);

            if (initResponse?.success && initResponse?.data?.user) {
              const userData = initResponse.data.user;
              console.log('Пользователь успешно инициализирован:', userData);

              setAppUser(userData);

              // Сохраняем JWT токен и ID пользователя
              if (initResponse.token) {
                localStorage.setItem('authToken', initResponse.token);
              }

              localStorage.setItem('userId', userData.id);

              setIsReady(true);
            } else {
              console.error(
                'Неверный формат ответа инициализации:',
                initResponse
              );
              setError(
                'Не удалось инициализировать пользователя: неверный формат ответа'
              );
            }
          } catch (apiError) {
            console.error('Ошибка API при инициализации:', apiError);
            setError(
              apiError instanceof Error
                ? apiError.message
                : 'Ошибка запроса API'
            );
          }
        }
        // Проверяем сохраненные данные пользователя
        else if (!window.Telegram?.WebApp) {
          const userId = localStorage.getItem('userId');
          const authToken = localStorage.getItem('authToken');

          if (userId && authToken) {
            console.log(
              'Режим браузера: загрузка сохраненного пользователя:',
              userId
            );

            try {
              const response = await userApi.getUserProfileWithoutCache(userId);
              console.log('Ответ API для сохраненного пользователя:', response);

              if (response?.success && response?.data) {
                console.log(
                  'Сохраненный пользователь загружен:',
                  response.data
                );
                setAppUser(response.data);
                setIsReady(true);
                return;
              }
            } catch (error) {
              console.error(
                'Ошибка загрузки сохраненного пользователя:',
                error
              );
              // Очищаем localStorage при ошибке
              localStorage.removeItem('userId');
              localStorage.removeItem('authToken');
            }
          }

          // Если нет сохраненного пользователя или произошла ошибка, создаем тестового
          console.log('Создание тестового пользователя для режима браузера');
          const testUser = {
            id: 12345678,
            username: 'testuser',
            first_name: 'Test',
            photo_url:
              'https://api.dicebear.com/7.x/avataaars/svg?seed=TestUser',
            telegram_id: 12345678,
            balance_stars: 1000,
            has_ton_wallet: false,
          };

          setUser(testUser as any);
          setAppUser(testUser as any);
          setIsReady(true);
        } else {
          console.log('Ожидание готовности Telegram WebApp...');
        }
      } catch (err) {
        console.error('Исключение при инициализации пользователя:', err);
        setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      } finally {
        setIsInitializing(false);
      }
    };

    // Запускаем инициализацию
    if ((webAppReady && webAppUser) || !window.Telegram?.WebApp) {
      console.log(
        'Условия для инициализации выполнены, запускаем initializeUser'
      );
      initializeUser();
    } else {
      console.log(
        'Ожидание готовности Telegram WebApp или данных пользователя'
      );
    }
  }, [webAppReady, webAppUser, isInitializing, isReady, appUser]);

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