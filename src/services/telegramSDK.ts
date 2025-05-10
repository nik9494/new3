/**
 * Telegram Mini App SDK Service
 * Provides integration with Telegram WebApp API
 */

// Определяем типы для Telegram WebApp
export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    query_id?: string;
    user?: TelegramUser;
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: string;
  themeParams: Record<string, string>;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;

  BackButton: {
    isVisible: boolean;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
    switchInlineQuery: (query: string, choose_chat_types?: string[]) => void;
  };

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

  HapticFeedback: {
    impactOccurred: (style: string) => void;
    notificationOccurred: (type: string) => void;
    selectionChanged: () => void;
  };

  close: () => void;
  expand: () => void;
  setBackgroundColor: (color: string) => void;
  setHeaderColor: (color: string) => void;

  showConfirm: (
    message: string,
    callback: (confirmed: boolean) => void
  ) => void;
  showPopup: (
    params: {
      title?: string;
      message: string;
      buttons?: Array<{ id: string; type?: string; text: string }>;
    },
    callback?: (buttonId: string) => void
  ) => void;
  showAlert: (message: string, callback?: () => void) => void;

  openLink: (url: string) => void;
  openTelegramLink: (url: string) => void;
  openInvoice: (url: string, callback?: (status: string) => void) => void;
  readTextFromClipboard: (callback: (text: string) => void) => void;
  requestWriteAccess: (callback: (access: boolean) => void) => void;
  requestContact: (callback: (result: boolean) => void) => void;

  ready: () => void;
  sendData: (data: string) => void;
  switchInlineQuery: (query: string, choose_chat_types?: string[]) => void;
  onEvent: (eventType: string, eventHandler: () => void) => void;
  offEvent: (eventType: string, eventHandler: () => void) => void;
}

/**
 * Проверка доступности Telegram WebApp в текущем окружении
 */
export const isTelegramWebAppAvailable = (): boolean =>
  Boolean(window.Telegram?.WebApp);

/**
 * Получить экземпляр Telegram WebApp
 */
export const getTelegramWebApp = (): TelegramWebApp | null =>
  isTelegramWebAppAvailable() ? window.Telegram!.WebApp! : null;

/**
 * Получить текущего пользователя из Telegram WebApp
 */
export const getTelegramUser = (): TelegramUser | null =>
  getTelegramWebApp()?.initDataUnsafe.user ?? null;

/**
 * Показать alert через Telegram WebApp или браузерный alert
 */
export const showAlert = (message: string, callback?: () => void): void => {
  const webApp = getTelegramWebApp();
  if (webApp) webApp.showAlert(message, callback);
  else {
    alert(message);
    callback?.();
  }
};

/**
 * Показать окно подтверждения через Telegram WebApp или стандартный confirm
 */
export const showConfirm = (
  message: string,
  callback: (confirmed: boolean) => void
): void => {
  const webApp = getTelegramWebApp();
  if (webApp) webApp.showConfirm(message, callback);
  else callback(window.confirm(message));
};

/**
 * Открыть платёжный инвойс через Telegram WebApp
 */
export const openInvoice = (
  url: string,
  callback?: (status: string) => void
): void => {
  const webApp = getTelegramWebApp();
  if (webApp) webApp.openInvoice(url, callback);
  else console.warn('Telegram WebApp не доступно, невозможно открыть инвойс');
};

/**
 * Валидация initData (рекомендуется реализовать на сервере)
 */
export const validateInitData = async (initData: string): Promise<boolean> => {
  try {
    const res = await fetch('/api/validate-telegram-init-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData }),
    });
    const data = await res.json();
    return data.valid;
  } catch {
    return false;
  }
};
