import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTelegram } from '../hooks/useTelegram';
import { useApiRequest } from '../hooks/useApiRequest';
import UserHeader from '../components/UserHeader';
import BottomNavigation from '../components/BottomNavigation';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Copy, Share2, Wallet } from 'lucide-react';

interface ProfileData {
  user: {
    id: string;
    username: string;
    telegram_id: number;
    balance_stars: number;
    has_ton_wallet: boolean;
  };
  wallet: string | null;
  stats: {
    games_played: number;
    games_won: number;
    total_earned: number;
    win_rate: number;
  };
  referral: {
    code: string | null;
    uses: Array<{
      username: string;
      used_at: string;
      games_played: number;
      bonus_earned: number;
    }>;
  };
}

// Новый интерфейс для ответа от API при инициализации пользователя
interface InitResponseData {
  user: {
    id: string;
    username: string;
    telegram_id: number;
    balance_stars: number;
    has_ton_wallet: boolean;
  };
  token?: string;
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, appUser } = useTelegram();
  const { fetchData } = useApiRequest();
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Используем useRef для отслеживания, был ли уже загружен профиль
  const profileLoaded = useRef(false);

  useEffect(() => {
    // Если профиль уже загружен, не делаем повторный запрос
    if (profileLoaded.current || (!user?.id && !appUser?.id)) {
      console.log('Профиль уже загружен или нет данных пользователя');
      return;
    }

    let mounted = true; // Флаг для отслеживания размонтирования компонента

    (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const userId = appUser?.id || localStorage.getItem('userId');
        const telegramId = user?.id;

        console.log('Загрузка профиля:', { userId, telegramId });
        
        // Заголовки для no-cache
        const noCacheHeaders = {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        };

        // Приоритет 1: Используем ID из appUser (если есть)
        let resp;
        if (userId) {
          try {
            console.log('Загрузка профиля по ID пользователя:', userId);
            resp = await fetchData<ProfileData>(`/api/users/${userId}`, {
              headers: noCacheHeaders,
            });

            if (resp.success && resp.data) {
              console.log('Профиль успешно загружен по ID:', resp.data);
              localStorage.setItem('userId', resp.data.user.id);
              if (resp.token) localStorage.setItem('authToken', resp.token);
              if (mounted) {
                setProfileData(resp.data);
                profileLoaded.current = true;
              }
              return;
            }
          } catch (userIdError) {
            console.error('Ошибка загрузки профиля по ID:', userIdError);
            // Очищаем localStorage, если ID недействителен
            localStorage.removeItem('userId');
          }
        }

        // Приоритет 2: Используем Telegram ID (если есть)
        if (telegramId) {
          try {
            console.log('Загрузка профиля по Telegram ID:', telegramId);
            resp = await fetchData<ProfileData>(`/api/users/telegram/${telegramId}`, {
              headers: noCacheHeaders,
            });

            if (resp.success && resp.data) {
              console.log('Профиль успешно загружен по Telegram ID:', resp.data);
              localStorage.setItem('userId', resp.data.user.id);
              if (resp.token) localStorage.setItem('authToken', resp.token);
              if (mounted) {
                setProfileData(resp.data);
                profileLoaded.current = true;
              }
              return;
            }
          } catch (telegramIdError) {
            console.error('Ошибка загрузки профиля по Telegram ID:', telegramIdError);
          }
        }

        // Приоритет 3: Инициализация нового пользователя (если есть Telegram ID)
        if (telegramId) {
          try {
            console.log('Инициализация нового пользователя:', telegramId);
            const initResp = await fetchData<InitResponseData>('/api/users/init', {
              method: 'POST',
              body: JSON.stringify({
                telegram_id: telegramId,
                username: user?.username || `User_${telegramId}`,
                first_name: user?.first_name,
                last_name: user?.last_name,
                photo_url: user?.photo_url,
              }),
              headers: noCacheHeaders,
            });

            if (initResp.success && initResp.data?.user) {
              console.log('Пользователь успешно инициализирован:', initResp.data);
              
              // Теперь загружаем профиль
              const newUserId = initResp.data.user.id;
              localStorage.setItem('userId', newUserId);
              if (initResp.token) localStorage.setItem('authToken', initResp.token);

              const profileResp = await fetchData<ProfileData>(`/api/users/${newUserId}`, {
                headers: noCacheHeaders,
              });
              
              if (profileResp.success && profileResp.data) {
                console.log('Профиль успешно загружен после инициализации:', profileResp.data);
                if (mounted) {
                  setProfileData(profileResp.data);
                  profileLoaded.current = true;
                }
                return;
              }
            }
          } catch (initError) {
            console.error('Ошибка инициализации пользователя:', initError);
          }
        }

        // Если все методы не сработали
        if (mounted) {
          setError('Не удалось загрузить профиль');
        }
      } catch (err) {
        if (mounted) {
          setError('Ошибка загрузки данных профиля');
        }
        console.error('Ошибка данных профиля:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();

    // Функция очистки при размонтировании компонента
    return () => {
      mounted = false;
    };
  }, [user?.id, appUser?.id, fetchData]);

  const copyReferralCode = () => {
    if (profileData?.referral?.code) {
      navigator.clipboard.writeText(profileData.referral.code);
      alert('Referral code copied to clipboard!');
    }
  };

  const shareReferralCode = () => {
    if (!profileData?.referral?.code) return;

    try {
      if (window.Telegram?.WebApp) {
        // Проверяем, поддерживается ли inline режим
        try {
          // Используем any для обхода проблемы с типизацией
          const webApp = window.Telegram.WebApp as any;
          if (typeof webApp.switchInlineQuery === 'function') {
            webApp.switchInlineQuery(`код ${profileData.referral.code}`, [
              'users',
              'groups',
              'channels',
            ]);
          } else {
            throw new Error('switchInlineQuery не поддерживается');
          }
        } catch (error) {
          console.log(
            'Inline режим не поддерживается, используем альтернативный способ'
          );
          // Если inline режим не поддерживается, используем копирование в буфер обмена
          navigator.clipboard.writeText(
            `Присоединяйтесь к Tap Battle! Используйте мой код ${profileData.referral.code} и получите 100 Stars бесплатно! ${window.location.origin}`
          );
          alert(
            `Код скопирован в буфер обмена: ${profileData.referral.code}\n\nВы можете вставить его в любой чат.`
          );
        }
      } else {
        // Для обычных браузеров используем Web Share API
        if (navigator.share) {
          navigator
            .share({
              title: 'Присоединяйтесь к Tap Battle!',
              text: `Используйте мой код ${profileData.referral.code} и получите 100 Stars бесплатно!`,
              url: window.location.origin,
            })
            .catch(() => {
              // Если Web Share API не поддерживается или пользователь отменил
              navigator.clipboard.writeText(
                `Присоединяйтесь к Tap Battle! Используйте мой код ${profileData.referral.code} и получите 100 Stars бесплатно! ${window.location.origin}`
              );
              alert(
                `Код скопирован в буфер обмена: ${profileData.referral.code}`
              );
            });
        } else {
          // Если Web Share API не поддерживается
          navigator.clipboard.writeText(
            `Присоединяйтесь к Tap Battle! Используйте мой код ${profileData.referral.code} и получите 100 Stars бесплатно! ${window.location.origin}`
          );
          alert(`Код скопирован в буфер обмена: ${profileData.referral.code}`);
        }
      }
    } catch (error) {
      console.error('Ошибка при попытке поделиться кодом:', error);
      alert(`Ваш реферальный код: ${profileData.referral.code}`);
    }
  };

  const connectWallet = () => {
    navigate('/connect-wallet');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#1E88E5] text-white">
        <UserHeader
          username={user?.username ?? 'Player'}
          avatarUrl={
            user?.photo_url ??
            'https://api.dicebear.com/7.x/avataaars/svg?seed=default'
          }
          starsBalance={0}
        />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
        </div>
        <BottomNavigation />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-[#1E88E5] text-white">
        <UserHeader
          username={user?.username ?? 'Player'}
          avatarUrl={
            user?.photo_url ??
            'https://api.dicebear.com/7.x/avataaars/svg?seed=default'
          }
          starsBalance={0}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="bg-white/10 p-6 rounded-lg max-w-md w-full text-center">
            <h2 className="text-xl font-bold mb-2">Error</h2>
            <p>{error}</p>
            <Button
              onClick={() => window.location.reload()}
              className="mt-4 bg-[#FFCA28] hover:bg-[#FFB300] text-black"
            >
              Retry
            </Button>
          </div>
        </div>
        <BottomNavigation />
      </div>
    );
  }

  if (!profileData || !profileData.stats) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#1E88E5] text-white">
      <UserHeader
        username={profileData.user.username}
        avatarUrl={
          user?.photo_url ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData.user.username}`
        }
        starsBalance={profileData.user.balance_stars}
      />

      <main className="flex-1 p-4 overflow-y-auto">
        <Card className="bg-white/10 backdrop-blur-sm p-6 mb-4 rounded-lg">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-white/20">
              <img
                src={
                  user?.photo_url ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${profileData.user.username}`
                }
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {profileData.user.username}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-yellow-300 font-bold">
                  {profileData.user.balance_stars}
                </span>
                <span>Stars</span>
              </div>
              {profileData.wallet && (
                <Badge className="mt-2 bg-[#FFCA28] text-black">
                  TON Wallet Connected
                </Badge>
              )}
            </div>
          </div>
        </Card>

        <Tabs defaultValue="stats" className="w-full">
          <TabsList className="w-full bg-white/10 mb-4">
            <TabsTrigger value="stats" className="flex-1">
              Stats
            </TabsTrigger>
            <TabsTrigger value="referral" className="flex-1">
              Referral
            </TabsTrigger>
            <TabsTrigger value="wallet" className="flex-1">
              Wallet
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-4">
            <Card className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold">
                    {profileData.stats.games_played}
                  </div>
                  <div className="text-sm opacity-80">Games Played</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold">
                    {profileData.stats.games_won}
                  </div>
                  <div className="text-sm opacity-80">Games Won</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold">
                    {profileData.stats.win_rate}%
                  </div>
                  <div className="text-sm opacity-80">Win Rate</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold">
                    {profileData.stats.total_earned}
                  </div>
                  <div className="text-sm opacity-80">Stars Earned</div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="referral" className="space-y-4">
            <Card className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              {profileData.referral.code ? (
                <>
                  <h3 className="text-lg font-medium mb-2">
                    Your Referral Code
                  </h3>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="bg-white/5 p-2 rounded flex-1 text-center font-mono text-lg">
                      {profileData.referral.code}
                    </div>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={copyReferralCode}
                    >
                      <Copy size={18} />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={shareReferralCode}
                    >
                      <Share2 size={18} />
                    </Button>
                  </div>
                  <p className="text-sm opacity-80 mb-4">
                    Share this code with friends. They'll get 100 Stars and
                    you'll earn 20 Stars for each friend who uses it!
                  </p>

                  <Separator className="my-4 bg-white/20" />

                  <h3 className="text-lg font-medium mb-2">Referral History</h3>
                  {profileData.referral.uses.length > 0 ? (
                    <div className="space-y-2">
                      {profileData.referral.uses.map((use, index) => (
                        <div key={index} className="bg-white/5 p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{use.username}</span>
                            <span className="text-xs opacity-70">
                              {new Date(use.used_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm mt-1">
                            <span>Games played: {use.games_played}</span>
                            <span className="text-yellow-300">
                              +{use.bonus_earned} Stars
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-4 opacity-70">
                      No referrals yet
                    </p>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="mb-4">You don't have a referral code yet</p>
                  <Button
                    onClick={async () => {
                      try {
                        const response = await fetchData(
                          '/api/referrals/generate',
                          {
                            method: 'POST',
                            body: JSON.stringify({
                              user_id: profileData.user.id,
                            }),
                          }
                        );
                        if (response.success) {
                          window.location.reload();
                        }
                      } catch (err) {
                        console.error('Error generating referral code:', err);
                      }
                    }}
                    className="bg-[#FFCA28] hover:bg-[#FFB300] text-black"
                  >
                    Generate Referral Code
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="wallet" className="space-y-4">
            <Card className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              {profileData.wallet ? (
                <>
                  <h3 className="text-lg font-medium mb-2">Your TON Wallet</h3>
                  <div className="bg-white/5 p-3 rounded-lg mb-4 break-all font-mono text-sm">
                    {profileData.wallet}
                  </div>

                  <div className="bg-white/5 p-4 rounded-lg mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span>Available Stars</span>
                      <span className="font-bold">
                        {profileData.user.balance_stars}
                      </span>
                    </div>
                    <Separator className="my-3 bg-white/20" />
                    <div className="flex justify-between items-center">
                      <span>Estimated TON</span>
                      <span className="font-bold">
                        {(profileData.user.balance_stars / 100).toFixed(2)} TON
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={async () => {
                      const amount = prompt(
                        'Enter amount of Stars to convert to TON:',
                        '100'
                      );
                      if (!amount) return;

                      const numAmount = parseInt(amount);
                      if (isNaN(numAmount) || numAmount <= 0) {
                        alert('Please enter a valid amount');
                        return;
                      }

                      if (numAmount > profileData.user.balance_stars) {
                        alert('Not enough Stars');
                        return;
                      }

                      try {
                        const response = await fetchData(
                          '/api/transactions/withdraw-ton',
                          {
                            method: 'POST',
                            body: JSON.stringify({
                              user_id: profileData.user.id,
                              amount: numAmount,
                            }),
                          }
                        );

                        if (response.success) {
                          alert(
                            `Successfully converted ${numAmount} Stars to ${(numAmount / 100).toFixed(2)} TON`
                          );
                          window.location.reload();
                        } else {
                          alert(
                            response.message || 'Failed to convert Stars to TON'
                          );
                        }
                      } catch (err) {
                        console.error('Error converting Stars to TON:', err);
                        alert('Error converting Stars to TON');
                      }
                    }}
                    className="w-full bg-[#FFCA28] hover:bg-[#FFB300] text-black"
                  >
                    Convert Stars to TON
                  </Button>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="mb-4 flex justify-center">
                    <Wallet size={48} className="opacity-50" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">
                    No TON Wallet Connected
                  </h3>
                  <p className="mb-4 opacity-70">
                    Connect your TON wallet to withdraw your Stars as TON
                    cryptocurrency
                  </p>
                  <Button
                    onClick={connectWallet}
                    className="bg-[#FFCA28] hover:bg-[#FFB300] text-black"
                  >
                    Connect TON Wallet
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <BottomNavigation />
    </div>
  );
}