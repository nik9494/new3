import { useNavigate } from 'react-router-dom';
import { useProfile } from '../contexts/ProfileContext';
import { useApiRequest } from '../hooks/useApiRequest';
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

export default function Profile() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useProfile();
  const { fetchData } = useApiRequest();

  // Пока профиль не загружен — единичный спиннер
  if (!profile) {
    return (
      <div className="flex flex-col min-h-screen bg-[#1E88E5] text-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
        </div>
        <BottomNavigation />
      </div>
    );
  }

  const copyReferralCode = () => {
    if (profile?.referral?.code) {
      navigator.clipboard.writeText(profile.referral.code);
      alert('Код скопирован в буфер обмена!');
    }
  };

  const shareReferralCode = () => {
    if (!profile?.referral?.code) return;

    try {
      if (window.Telegram?.WebApp) {
        // Проверяем, поддерживается ли inline режим
        try {
          // Используем any для обхода проблемы с типизацией
          const webApp = window.Telegram.WebApp as any;
          if (typeof webApp.switchInlineQuery === 'function') {
            webApp.switchInlineQuery(`код ${profile.referral.code}`, [
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
            `Присоединяйтесь к Tap Battle! Используйте мой код ${profile.referral.code} и получите 100 Stars бесплатно! ${window.location.origin}`
          );
          alert(
            `Код скопирован в буфер обмена: ${profile.referral.code}\n\nВы можете вставить его в любой чат.`
          );
        }
      } else {
        // Для обычных браузеров используем Web Share API
        if (navigator.share) {
          navigator
            .share({
              title: 'Присоединяйтесь к Tap Battle!',
              text: `Используйте мой код ${profile.referral.code} и получите 100 Stars бесплатно!`,
              url: window.location.origin,
            })
            .catch(() => {
              // Если Web Share API не поддерживается или пользователь отменил
              navigator.clipboard.writeText(
                `Присоединяйтесь к Tap Battle! Используйте мой код ${profile.referral.code} и получите 100 Stars бесплатно! ${window.location.origin}`
              );
              alert(
                `Код скопирован в буфер обмена: ${profile.referral.code}`
              );
            });
        } else {
          // Если Web Share API не поддерживается
          navigator.clipboard.writeText(
            `Присоединяйтесь к Tap Battle! Используйте мой код ${profile.referral.code} и получите 100 Stars бесплатно! ${window.location.origin}`
          );
          alert(`Код скопирован в буфер обмена: ${profile.referral.code}`);
        }
      }
    } catch (error) {
      console.error('Ошибка при попытке поделиться кодом:', error);
      alert(`Ваш реферальный код: ${profile.referral.code}`);
    }
  };

  const connectWallet = () => {
    navigate('/connect-wallet');
  };

  const generateReferral = async () => {
    try {
      const response = await fetchData(
        '/api/referrals/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            user_id: profile.user.id,
          }),
        }
      );
      if (response.success) {
        refreshProfile();
      }
    } catch (err) {
      console.error('Ошибка генерации реферального кода:', err);
    }
  };

  const withdrawToTon = async () => {
    const amount = prompt(
      'Введите количество Stars для конвертации в TON:',
      '100'
    );
    if (!amount) return;

    const numAmount = parseInt(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Пожалуйста, введите корректное количество');
      return;
    }

    if (numAmount > profile.user.balance_stars) {
      alert('Недостаточно Stars');
      return;
    }

    try {
      const response = await fetchData(
        '/api/transactions/withdraw-ton',
        {
          method: 'POST',
          body: JSON.stringify({
            user_id: profile.user.id,
            amount: numAmount,
          }),
        }
      );

      if (response.success) {
        alert(
          `Успешно конвертировано ${numAmount} Stars в ${(numAmount / 100).toFixed(2)} TON`
        );
        refreshProfile();
      } else {
        alert(
          response.message || 'Не удалось конвертировать Stars в TON'
        );
      }
    } catch (err) {
      console.error('Ошибка конвертации Stars в TON:', err);
      alert('Ошибка конвертации Stars в TON');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#1E88E5] text-white">
      <main className="flex-1 p-4 overflow-y-auto">
        <Tabs defaultValue="stats" className="w-full">
          <TabsList className="w-full bg-white/10 mb-4">
            <TabsTrigger value="stats" className="flex-1">
              Статистика
            </TabsTrigger>
            <TabsTrigger value="referral" className="flex-1">
              Рефералы
            </TabsTrigger>
            <TabsTrigger value="wallet" className="flex-1">
              Кошелек
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stats" className="space-y-4">
            <Card className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold">
                    {profile.stats?.games_played}
                  </div>
                  <div className="text-sm opacity-80">Игр сыграно</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold">
                    {profile.stats?.games_won}
                  </div>
                  <div className="text-sm opacity-80">Игр выиграно</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold">
                    {profile.stats?.win_rate}%
                  </div>
                  <div className="text-sm opacity-80">Процент побед</div>
                </div>
                <div className="text-center p-3 bg-white/5 rounded-lg">
                  <div className="text-2xl font-bold">
                    {profile.stats?.total_earned}
                  </div>
                  <div className="text-sm opacity-80">Stars заработано</div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="referral" className="space-y-4">
            <Card className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              {profile.referral?.code ? (
                <>
                  <h3 className="text-lg font-medium mb-2">
                    Ваш реферальный код
                  </h3>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="bg-white/5 p-2 rounded flex-1 text-center font-mono text-lg">
                      {profile.referral.code}
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
                    Поделитесь этим кодом с друзьями. Они получат 100 Stars, а вы заработаете 
                    20 Stars за каждого друга, использовавшего ваш код!
                  </p>

                  <Separator className="my-4 bg-white/20" />

                  <h3 className="text-lg font-medium mb-2">История рефералов</h3>
                  {profile.referral.uses.length > 0 ? (
                    <div className="space-y-2">
                      {profile.referral.uses.map((use, index) => (
                        <div key={index} className="bg-white/5 p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="font-medium">{use.username}</span>
                            <span className="text-xs opacity-70">
                              {new Date(use.used_at).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm mt-1">
                            <span>Игр сыграно: {use.games_played}</span>
                            <span className="text-yellow-300">
                              +{use.bonus_earned} Stars
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-4 opacity-70">
                      Пока нет рефералов
                    </p>
                  )}
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="mb-4">У вас ещё нет реферального кода</p>
                  <Button
                    onClick={generateReferral}
                    className="bg-[#FFCA28] hover:bg-[#FFB300] text-black"
                  >
                    Создать реферальный код
                  </Button>
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="wallet" className="space-y-4">
            <Card className="bg-white/10 backdrop-blur-sm p-4 rounded-lg">
              {profile.wallet ? (
                <>
                  <h3 className="text-lg font-medium mb-2">Ваш кошелек TON</h3>
                  <div className="bg-white/5 p-3 rounded-lg mb-4 break-all font-mono text-sm">
                    {profile.wallet}
                  </div>

                  <div className="bg-white/5 p-4 rounded-lg mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span>Доступно Stars</span>
                      <span className="font-bold">
                        {profile.user.balance_stars}
                      </span>
                    </div>
                    <Separator className="my-3 bg-white/20" />
                    <div className="flex justify-between items-center">
                      <span>Примерно в TON</span>
                      <span className="font-bold">
                        {(profile.user.balance_stars / 100).toFixed(2)} TON
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={withdrawToTon}
                    className="w-full bg-[#FFCA28] hover:bg-[#FFB300] text-black"
                  >
                    Конвертировать Stars в TON
                  </Button>
                </>
              ) : (
                <div className="text-center py-6">
                  <div className="mb-4 flex justify-center">
                    <Wallet size={48} className="opacity-50" />
                  </div>
                  <h3 className="text-lg font-medium mb-2">
                    Кошелек TON не подключен
                  </h3>
                  <p className="mb-4 opacity-70">
                    Подключите кошелек TON, чтобы выводить Stars в виде криптовалюты TON
                  </p>
                  <Button
                    onClick={connectWallet}
                    className="bg-[#FFCA28] hover:bg-[#FFB300] text-black"
                  >
                    Подключить кошелек TON
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