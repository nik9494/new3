import { useEffect, useState } from 'react';

interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

interface TelegramWebAppInitData {
  query_id?: string;
  user?: TelegramWebAppUser;
  auth_date?: number;
  hash?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: TelegramWebAppInitData;
  ready: () => void;
  expand: () => void;
  close: () => void;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive: boolean) => void;
    hideProgress: () => void;
  };
  BackButton: {
    isVisible: boolean;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
  };
  HapticFeedback: {
    impactOccurred: (
      style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
    ) => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

export default function useTelegramWebApp() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramWebAppUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Check if Telegram WebApp is available
    if (window.Telegram?.WebApp) {
      const tgWebApp = window.Telegram.WebApp;

      // Tell Telegram WebApp we're ready
      tgWebApp.ready();

      // Set the WebApp state
      setWebApp(tgWebApp);
      setIsReady(true);

      // Extract user data if available
      if (tgWebApp.initDataUnsafe?.user) {
        setUser(tgWebApp.initDataUnsafe.user);
      }

      // Expand the WebApp to take full screen
      if (!tgWebApp.isExpanded) {
        tgWebApp.expand();
      }

      console.log('Telegram WebApp initialized successfully');
      console.log('User data:', tgWebApp.initDataUnsafe?.user);
    } else {
      console.log('Telegram WebApp is not available, running in browser mode');
      // Mock user for development in browser
      setUser({
        id: 12345678,
        first_name: 'Test',
        last_name: 'User',
        username: 'testuser',
        photo_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=TestUser',
      });
      setIsReady(true);
    }
  }, []);

  return { webApp, user, isReady };
}
