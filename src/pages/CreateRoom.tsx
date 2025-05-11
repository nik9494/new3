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
import { roomApi } from '@/services/api';

const CreateRoom: React.FC = () => {
  const navigate = useNavigate();
  const { user, appUser } = useTelegram();
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');
  const [entryFee, setEntryFee] = useState<number>(50);
  const [maxPlayers, setMaxPlayers] = useState<number>(10);
  const [roomKey, setRoomKey] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Hero room success dialog
  const [showSuccessDialog, setShowSuccessDialog] = useState<boolean>(false);
  const [createdRoomKey, setCreatedRoomKey] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(600); // 10 minutes in seconds

  // Timer effect for room expiration countdown
  useEffect(() => {
    let timer: number;
    if (showSuccessDialog && timeLeft > 0) {
      timer = window.setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setShowSuccessDialog(false);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [showSuccessDialog, timeLeft]);

  // Format seconds to MM:SS
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCreateRoom = async () => {
    try {
      setIsLoading(true);
      setError('');

      if (!appUser?.id) {
        throw new Error('Пользователь не авторизован');
      }

      const response = await roomApi.createRoom(appUser.id, 'hero', entryFee);

      if (response && response.room_key) {
        setCreatedRoomKey(response.room_key);
        setTimeLeft(600); // 10 minutes
        setShowSuccessDialog(true);
      } else {
        // Navigate to the game room
        navigate(`/game-room/${response.id}`);
      }
    } catch (error: any) {
      console.error('Error creating room:', error);

      // Handle specific error for existing room
      if (
        error.message &&
        error.message.includes('уже есть открытая комната')
      ) {
        setError(
          'У вас уже есть открытая комната. Завершите её или дождитесь окончания.'
        );
      } else {
        setError(
          error instanceof Error ? error.message : 'Не удалось создать комнату'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const copyRoomKey = () => {
    if (createdRoomKey) {
      navigator.clipboard.writeText(createdRoomKey);
      alert('Ключ комнаты скопирован!');
    }
  };

  const enterCreatedRoom = () => {
    if (createdRoomKey) {
      setShowSuccessDialog(false);
      navigate(`/game-room/${createdRoomKey}`);
    }
  };

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

      const response = await roomApi.joinRoomByKey(roomKey, appUser.id);

      if (response && response.room) {
        // Navigate to the game room
        navigate(`/game-room/${response.room.id}`);
      } else {
        throw new Error('Не удалось войти в комнату');
      }
    } catch (error: any) {
      console.error('Error joining room:', error);

      // Handle specific errors
      if (
        error.message &&
        error.message.includes('Организатор не запустил игру')
      ) {
        setError(
          'Организатор не запустил игру вовремя. Свяжитесь с организатором или введите другой ключ.'
        );
      } else if (
        error.message &&
        error.message.includes('Insufficient balance')
      ) {
        setError('Недостаточно Stars для входа в комнату. Пополните баланс.');
      } else if (error.message && error.message.includes('Room is full')) {
        setError('Комната уже заполнена.');
      } else if (error.message && error.message.includes('Room not found')) {
        setError('Комната не найдена. Проверьте ключ и попробуйте снова.');
      } else {
        setError(
          error instanceof Error ? error.message : 'Не удалось войти в комнату'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#FFCA28]">
      {/* Main Content */}
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
                    <li>Время жизни комнаты - 10 минут</li>
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
                <Button
                  className="w-full"
                  onClick={handleCreateRoom}
                  disabled={isLoading}
                >
                  {isLoading ? 'Создание...' : 'Создать комнату'}
                </Button>
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

      {/* Room Created Success Dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
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
              Комната будет доступна в течение 10 минут. После этого она
              автоматически закроется.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={enterCreatedRoom} className="w-full">
              Войти в комнату
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};

export default CreateRoom;
