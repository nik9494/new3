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
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import BottomNavigation from '@/components/BottomNavigation';
import useTelegram from '@/hooks/useTelegram';
import { standardApi, Room as ApiRoom } from '@/services/api';

// Расширение типа Room с необходимыми полями для компонента
interface ComponentRoom extends ApiRoom {
  player_count: number;
  max_players: number;
  created_at: string;
}

const StandardRoom: React.FC = () => {
  const navigate = useNavigate();
  const { user, appUser } = useTelegram();
  
  // Состояния компонента
  const [rooms, setRooms] = useState<ComponentRoom[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [entryFee, setEntryFee] = useState<number>(50);
  const [activeTab, setActiveTab] = useState<'join' | 'create'>('join');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Загрузка списка комнат при монтировании компонента
  useEffect(() => {
    fetchRooms();
  }, []);

  // Функция для загрузки списка комнат с адаптацией данных
  const fetchRooms = async () => {
    setIsLoading(true);
    setError('');
    setIsRefreshing(true);
    
    try {
      const data = await standardApi.list();
      // Адаптируем данные с API к ожидаемому формату компонента
      const adaptedRooms: ComponentRoom[] = data.map(apiRoom => ({
        ...apiRoom,
        // Предполагаем, что эти поля есть в API, но могут называться иначе
        // или вычисляем значения по умолчанию
        player_count: (apiRoom as any).player_count || 0,
        max_players: apiRoom.max_players || 10,
        created_at: apiRoom.created_at || new Date().toISOString()
      }));
      
      setRooms(adaptedRooms);
    } catch (e: any) {
      console.error('Error fetching standard rooms:', e);
      setError(e instanceof Error ? e.message : 'Не удалось загрузить список комнат');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Обработчик создания или присоединения к комнате
  const handleJoinOrCreate = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      if (!appUser?.id) {
        throw new Error('Пользователь не авторизован');
      }
      
      const response = await standardApi.joinOrCreate(entryFee);
      const { roomId, gameStarting } = response;
      
      // Навигация в комнату игры
      navigate(`/standard-room/${roomId}`);
    } catch (e: any) {
      console.error('Error joining/creating standard room:', e);
      
      // Обработка специфических ошибок
      if (e.message && e.message.includes('Insufficient balance')) {
        setError('Недостаточно Stars для входа в комнату. Пополните баланс.');
      } else {
        setError(e instanceof Error ? e.message : 'Не удалось присоединиться к комнате');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Обработчик присоединения к конкретной комнате
  const handleJoinRoom = async (roomId: string) => {
    try {
      setIsLoading(true);
      setError('');
      
      if (!appUser?.id) {
        throw new Error('Пользователь не авторизован');
      }
      
      const response = await standardApi.get(roomId);
      
      // Если комната существует, переходим в неё
      navigate(`/standard-room/${roomId}`);
    } catch (error: any) {
      console.error('Error joining room:', error);
      
      // Обработка специфических ошибок
      if (error.message && error.message.includes('Room is full')) {
        setError('Комната уже заполнена.');
      } else if (error.message && error.message.includes('Room not found')) {
        setError('Комната не найдена.');
      } else if (error.message && error.message.includes('Insufficient balance')) {
        setError('Недостаточно Stars для входа в комнату. Пополните баланс.');
      } else {
        setError(
          error instanceof Error ? error.message : 'Не удалось войти в комнату'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Форматирование ID комнаты для отображения
  const formatRoomId = (id: string): string => {
    return id.slice(0, 8);
  };

  // Форматирование времени создания комнаты
  const formatCreatedAt = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#FFCA28]">
      {/* Main Content */}
      <main className="flex-1 p-4 pb-20">
        <h1 className="text-2xl font-bold mb-4 text-center">Стандартные комнаты</h1>

        <Tabs
          defaultValue="join"
          onValueChange={value => setActiveTab(value as 'join' | 'create')}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="join">Доступные комнаты</TabsTrigger>
            <TabsTrigger value="create">Создать/Присоединиться</TabsTrigger>
          </TabsList>

          <TabsContent value="join" className="mt-4">
            <div className="mb-4 flex justify-between items-center">
              <h2 className="text-lg font-semibold">Список доступных комнат</h2>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={fetchRooms}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Ошибка</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoading && !rooms.length ? (
              <div className="flex justify-center p-8">
                <div className="animate-spin w-8 h-8 border-4 border-[#FFCA28] border-t-transparent rounded-full"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {rooms.length ? (
                  rooms.map((room) => (
                    <Card key={room.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg">Комната {formatRoomId(room.id)}</CardTitle>
                        <CardDescription>
                          Создана в {formatCreatedAt(room.created_at)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pb-2">
                        <div className="flex justify-between items-center">
                          <span>Взнос: {room.entry_fee} ⭐</span>
                          <span>Игроки: {room.player_count} / {room.max_players}</span>
                        </div>
                      </CardContent>
                      <CardFooter>
                        <Button 
                          className="w-full" 
                          onClick={() => handleJoinRoom(room.id)}
                          disabled={isLoading || room.player_count === room.max_players}
                        >
                          {room.player_count === room.max_players ? 'Комната заполнена' : 'Войти'}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                ) : (
                  <div className="bg-white/20 p-6 rounded-md text-center">
                    <p className="text-lg">Нет доступных комнат</p>
                    <p className="text-sm mt-2">Создайте новую или попробуйте обновить список</p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="create" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Создать или присоединиться</CardTitle>
                <CardDescription>
                  Вы будете присоединены к существующей комнате или создана новая
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
                  <p className="text-sm">Информация о стандартных комнатах:</p>
                  <ul className="text-xs mt-1 space-y-1 list-disc pl-4">
                    <li>Игра начинается автоматически при заполнении комнаты</li>
                    <li>В каждой комнате до 10 игроков</li>
                    <li>Победитель получает весь призовой фонд</li>
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
                  onClick={handleJoinOrCreate}
                  disabled={isLoading}
                >
                  {isLoading ? 'Подождите...' : 'Создать или присоединиться'}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};

export default StandardRoom;