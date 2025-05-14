import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { AlertCircle, Copy, Clock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import BottomNavigation from '@/components/BottomNavigation';
import useTelegram from '@/hooks/useTelegram';
import { heroApi } from '@/services/api';

// Ключи для хранения данных
const LOCALSTORAGE_KEY_ROOM_ID = 'currentHeroRoomId';
const LOCALSTORAGE_KEY_ROOM_KEY = 'currentHeroRoomKey';
const LOCALSTORAGE_KEY_CREATED_AT = 'currentHeroRoomCreatedAt';
const LOCALSTORAGE_KEY_ROOM_TYPE = 'currentRoomType';

const CreateRoom: React.FC = () => {
  const navigate = useNavigate();
  const { appUser } = useTelegram();
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [entryFee, setEntryFee] = useState<number>(50);
  const [roomKey, setRoomKey] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Состояния для Hero комнаты
  const [showSuccessDialog, setShowSuccessDialog] = useState<boolean>(false);
  const [createdRoomKey, setCreatedRoomKey] = useState<string>('');
  const [roomId, setRoomId] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isObserverMode, setIsObserverMode] = useState<boolean>(false);

  // Расчет оставшегося времени комнаты
  const calculateTimeLeft = (): number => {
    const createdAtStr = localStorage.getItem(LOCALSTORAGE_KEY_CREATED_AT);
    if (!createdAtStr) return 0;

    const createdAt = parseInt(createdAtStr, 10);
    const expiresAt = createdAt + 5 * 60 * 1000; // 5 минут в миллисекундах
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    return remaining;
  };

  // Восстановление данных при загрузке компонента
  useEffect(() => {
    const storedRoomId = localStorage.getItem(LOCALSTORAGE_KEY_ROOM_ID);
    const storedRoomKey = localStorage.getItem(LOCALSTORAGE_KEY_ROOM_KEY);

    if (storedRoomId) {
      setRoomId(storedRoomId);
    }

    if (storedRoomKey) {
      setCreatedRoomKey(storedRoomKey);
    }

    // Инициализация таймера
    setTimeLeft(calculateTimeLeft());
  }, []);

  // Проверка существующей комнаты
  useEffect(() => {
    if (roomId) {
      heroApi.observe(roomId)
        .then(({ room }) => {
          setIsObserverMode(true);

          // Сохраняем время создания комнаты, если оно не сохранено
          if (!localStorage.getItem(LOCALSTORAGE_KEY_CREATED_AT)) {
            const currentTime = Date.now();
            const createdAt = currentTime - (300 - room.time_left_seconds) * 1000;
            localStorage.setItem(LOCALSTORAGE_KEY_CREATED_AT, createdAt.toString());
          }

          setTimeLeft(calculateTimeLeft());
        })
        .catch(() => {
          // Комната уже закрыта, очищаем данные
          clearRoomData();
        });
    }
  }, [roomId]);

  // Таймер обратного отсчета
  useEffect(() => {
    if (!roomId) return;

    const timer = window.setInterval(() => {
      const remaining = calculateTimeLeft();
      setTimeLeft(remaining);

      // Если время вышло, очищаем данные комнаты
      if (remaining <= 0) {
        clearRoomData();
        clearInterval(timer);
        setShowSuccessDialog(false);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [roomId]);

  // Очистка данных комнаты
  const clearRoomData = () => {
    localStorage.removeItem(LOCALSTORAGE_KEY_ROOM_ID);
    localStorage.removeItem(LOCALSTORAGE_KEY_ROOM_KEY);
    localStorage.removeItem(LOCALSTORAGE_KEY_ROOM_TYPE);
    localStorage.removeItem(LOCALSTORAGE_KEY_CREATED_AT);
    setRoomId('');
    setCreatedRoomKey('');
    setIsObserverMode(false);
  };

  // Форматирование времени в MM:SS
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Создание комнаты
  const handleCreateRoom = async () => {
    setIsLoading(true);
    setError('');
    try {
      if (!appUser?.id) {
        throw new Error('Пользователь не авторизован');
      }

      const room = await heroApi.create(entryFee);

      // Сохраняем данные комнаты
      setCreatedRoomKey(room.room_key);
      setRoomId(room.id);
      localStorage.setItem(LOCALSTORAGE_KEY_ROOM_ID, room.id);
      localStorage.setItem(LOCALSTORAGE_KEY_ROOM_KEY, room.room_key);
      localStorage.setItem(LOCALSTORAGE_KEY_ROOM_TYPE, 'hero');
      localStorage.setItem(LOCALSTORAGE_KEY_CREATED_AT, Date.now().toString());

      // Запрашиваем информацию о комнате
      try {
        const { room: observed } = await heroApi.observe(room.id);
        setTimeLeft(calculateTimeLeft());
        setIsObserverMode(true);
        setShowSuccessDialog(true);
      } catch {
        setError('Не удалось получить время жизни комнаты');
        clearRoomData();
      }
    } catch (e: any) {
      console.error('Ошибка при создании комнаты:', e);

      if (e.message && e.message.includes('уже есть открытая комната')) {
        setError('У вас уже есть открытая комната. Завершите её или дождитесь окончания.');
      } else {
        setError(e instanceof Error ? e.message : 'Не удалось создать комнату');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Копирование ключа комнаты
  const copyRoomKey = () => {
    if (createdRoomKey) {
      navigator.clipboard.writeText(createdRoomKey);
      alert('Ключ комнаты скопирован!');
    }
  };

  // Вход в созданную комнату
  const enterCreatedRoom = async () => {
    try {
      const { room } = await heroApi.observe(roomId);
      setTimeLeft(calculateTimeLeft());
      setIsObserverMode(true);
      navigate(`/game-room/${roomId}?observer=true`);
    } catch {
      navigate(`/game-room/${roomId}`);
      clearRoomData();
    }
  };

  // Вход в комнату по ключу
  const handleJoinRoom = async () => {
    try {
      setIsLoading(true);
      setError('');

      if (!roomKey.trim()) {
        throw new Error('Введите ключ комнаты');
      }

      if (!appUser?.id) {
        throw new Error('Пользователь не авторизован');
      }

      const response = await heroApi.joinByKey(roomKey);

      if (response && response.room) {
        navigate(`/game-room/${response.room.id}`);
      } else {
        throw new Error('Не удалось войти в комнату');
      }
    } catch (error: any) {
      console.error('Ошибка при входе в комнату:', error);

      if (error.message && error.message.includes('Организатор не запустил игру')) {
        setError('Организатор не запустил игру вовремя. Свяжитесь с организатором или введите другой ключ.');
      } else if (error.message && error.message.includes('Insufficient balance')) {
        setError('Недостаточно Stars для входа в комнату. Пополните баланс.');
      } else if (error.message && error.message.includes('Room is full')) {
        setError('Комната уже заполнена.');
      } else if (error.message && error.message.includes('Room not found')) {
        setError('Комната не найдена. Проверьте ключ и попробуйте снова.');
      } else {
        setError(error instanceof Error ? error.message : 'Не удалось войти в комнату');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Закрытие комнаты
  const handleCloseRoom = async () => {
    try {
      await heroApi.delete(roomId);
      clearRoomData();
      setShowSuccessDialog(false);
    } catch (error) {
      console.error('Ошибка при закрытии комнаты:', error);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#FFCA28]">
      {/* Основной контент */}
      <main className="flex-1 p-4 pb-20">
        <h1 className="text-2xl font-bold mb-4 text-center">Hero Комнаты</h1>

        <Tabs
          defaultValue="create"
          onValueChange={value => setActiveTab(value as 'create' | 'join')}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create">Создать</TabsTrigger>
            <TabsTrigger value="join">Войти</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Создать Hero комнату</CardTitle>
                <CardDescription>
                  Настройте параметры вашей комнаты и пригласите друзей
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label htmlFor="entry-fee">Стоимость входа (Stars)</Label>
                    <span className="font-medium">{entryFee} ⭐</span>
                  </div>
                  <Slider
                    id="entry-fee"
                    min={10}
                    max={500}
                    step={10}
                    value={[entryFee]}
                    onValueChange={values => setEntryFee(values[0])}
                  />
                </div>

                <div className="bg-white/20 p-3 rounded-md">
                  <p className="text-sm">Информация о Hero комнатах:</p>
                  <ul className="text-xs mt-1 space-y-1 list-disc pl-4">
                    <li>До 30 игроков могут присоединиться по ключу</li>
                    <li>Время жизни комнаты - 5 минут</li>
                    <li>Организатор получает 7% от призового фонда</li>
                  </ul>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Ошибка</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter>
                {roomId && isObserverMode ? (
                  <Button
                    onClick={enterCreatedRoom}
                    className="w-full"
                  >
                    Войти как организатор
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={handleCreateRoom}
                    disabled={isLoading}
                  >
                    {isLoading ? 'Создание...' : 'Создать комнату'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="join" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Войти в Hero комнату</CardTitle>
                <CardDescription>
                  Введите ключ комнаты, который вам дал создатель
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="room-key">Ключ комнаты</Label>
                  <Input
                    id="room-key"
                    placeholder="Введите ключ комнаты"
                    value={roomKey}
                    onChange={e => setRoomKey(e.target.value.toUpperCase())}
                    maxLength={6}
                    className="uppercase"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Ошибка</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  onClick={handleJoinRoom}
                  disabled={isLoading}
                >
                  {isLoading ? 'Поиск комнаты...' : 'Войти в комнату'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Диалог успешного создания комнаты */}
      <Dialog
        open={showSuccessDialog}
        onOpenChange={open => {
          setShowSuccessDialog(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Комната создана!</DialogTitle>
            <DialogDescription>
              Поделитесь ключом комнаты с друзьями
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <div className="bg-[#FFCA28]/20 p-3 rounded-md flex-1 text-center">
                <span className="text-2xl font-mono font-bold">
                  {createdRoomKey}
                </span>
              </div>
              <Button size="icon" variant="outline" onClick={copyRoomKey}>
                <Copy size={18} />
              </Button>
            </div>

            <div className="flex items-center justify-center gap-2 text-center">
              <Clock className="h-5 w-5" />
              <span className="font-mono">{formatTime(timeLeft)}</span>
            </div>

            <p className="text-sm text-center">
              Комната будет доступна в течение 5 минут. После этого она
              автоматически закроется.
            </p>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              onClick={handleCloseRoom}
              className="w-full sm:w-auto"
            >
              Закрыть комнату
            </Button>
            <Button
              onClick={enterCreatedRoom}
              className="w-full sm:w-auto"
            >
              {isObserverMode ? 'Войти как наблюдатель' : 'Войти в комнату'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Плавающая кнопка таймера */}
      {roomId && !showSuccessDialog && timeLeft > 0 && (
        <button
          className="fixed bottom-20 right-4 p-2 rounded-full bg-white shadow-lg flex items-center justify-center"
          onClick={() => setShowSuccessDialog(true)}
        >
          <Clock className="h-5 w-5 mr-1" />
          <span className="font-mono text-sm">{formatTime(timeLeft)}</span>
        </button>
      )}

      {/* Нижняя навигация */}
      <BottomNavigation />
    </div>
  );
};

export default CreateRoom;