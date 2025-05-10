import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { motion } from 'framer-motion';
import { Clock, Award, Loader2 } from 'lucide-react';
import UserHeader from '@/components/UserHeader';
import BottomNavigation from '@/components/BottomNavigation';
import useTelegram from '@/hooks/useTelegram';
// import { bonusApi } from "@/services/api";

interface BonusRoomProps {
  onExit?: () => void;
}

const BonusRoom: React.FC<BonusRoomProps> = ({ onExit = () => {} }) => {
  const { user } = useTelegram();
  const [status, setStatus] = useState<
    'idle' | 'active' | 'completed' | 'failed'
  >('idle');
  const [tapCount, setTapCount] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(24 * 60 * 60); // 24 hours in seconds
  const [startTime, setStartTime] = useState<number | null>(null);

  const TARGET_TAPS = 1000000;

  useEffect(() => {
    // Load saved state from localStorage
    const savedState = localStorage.getItem('bonusRoomState');
    if (savedState) {
      const { status, tapCount, startTime } = JSON.parse(savedState);
      setStatus(status);
      setTapCount(tapCount);
      setStartTime(startTime);

      // Calculate time left if active
      if (status === 'active' && startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = 24 * 60 * 60 - elapsed;
        if (remaining <= 0) {
          setStatus('failed');
          setTimeLeft(0);
        } else {
          setTimeLeft(remaining);
        }
      }
    }
  }, []);

  useEffect(() => {
    // Save state to localStorage whenever it changes
    if (status !== 'idle') {
      localStorage.setItem(
        'bonusRoomState',
        JSON.stringify({ status, tapCount, startTime })
      );
    }
  }, [status, tapCount, startTime]);

  useEffect(() => {
    let timer: number;

    if (status === 'active') {
      timer = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setStatus('failed');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status]);

  const handleStart = () => {
    const now = Date.now();
    setStartTime(now);
    setStatus('active');
    setTapCount(0);
    setTimeLeft(24 * 60 * 60);
  };

  const handleTap = async () => {
    if (status !== 'active') return;

    const newCount = tapCount + 1;
    setTapCount(newCount);

    // Update progress periodically (every 100 taps)
    if (newCount % 100 === 0) {
      try {
        const userId = localStorage.getItem('userId');
        if (userId) {
          // In a real app, this would call the API to update progress
          // await bonusApi.updateBonusProgress(userId, newCount);
          console.log(`Bonus progress updated: ${newCount} taps`);
        }
      } catch (error) {
        console.error('Error updating bonus progress:', error);
      }
    }

    // Check if target reached
    if (newCount >= TARGET_TAPS) {
      setStatus('completed');
    }
  };

  const handleReset = async () => {
    try {
      // If completed, claim the bonus through API
      if (status === 'completed') {
        const userId = localStorage.getItem('userId');
        if (userId) {
          // In a real app, this would call the API to award the bonus
          // await bonusApi.completeBonusChallenge(userId);

          // For now, just show an alert
          alert('Congratulations! 3000 Stars have been added to your account.');
        }
      }

      // Reset state
      localStorage.removeItem('bonusRoomState');
      setStatus('idle');
      setTapCount(0);
      setStartTime(null);
      setTimeLeft(24 * 60 * 60);
    } catch (error) {
      console.error('Error claiming bonus:', error);
      alert('Failed to claim bonus. Please try again.');
    }
  };

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = (tapCount / TARGET_TAPS) * 100;

  return (
    <div className="flex flex-col min-h-screen bg-[#FFCA28]">
      {/* User Header */}
      <UserHeader
        username={user?.username || 'Player'}
        avatarUrl={
          user?.photo_url ||
          'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
        }
        starsBalance={1000}
      />

      {/* Main Content */}
      <main className="flex-1 p-4 pb-20 flex flex-col items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Бонусная комната</CardTitle>
            <CardDescription className="text-center">
              Сделайте 1 000 000 тапов за 24 часа и получите 3000 Stars!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Прогресс</span>
                <span>
                  {tapCount.toLocaleString()} / {TARGET_TAPS.toLocaleString()}
                </span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </div>

            {/* Timer */}
            <div className="flex items-center justify-center gap-2 text-lg font-mono">
              <Clock className="h-5 w-5" />
              <span>{formatTime(timeLeft)}</span>
            </div>

            {/* Tap button */}
            {status === 'active' && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                className="w-full h-40 rounded-xl bg-primary text-primary-foreground text-3xl font-bold flex flex-col items-center justify-center"
                onClick={handleTap}
              >
                TAP
                <span className="text-sm mt-2">
                  {tapCount.toLocaleString()} тапов
                </span>
              </motion.button>
            )}

            {/* Start button */}
            {status === 'idle' && (
              <Button
                size="lg"
                className="w-full py-8 text-xl"
                onClick={handleStart}
              >
                Начать бонусный челлендж
              </Button>
            )}

            {/* Completed state */}
            {status === 'completed' && (
              <div className="text-center py-6">
                <Award className="h-16 w-16 mx-auto text-yellow-500 mb-4" />
                <h3 className="text-xl font-bold mb-2">Поздравляем!</h3>
                <p className="mb-4">
                  Вы успешно выполнили бонусный челлендж и получили 3000 Stars!
                </p>
                <Button onClick={handleReset}>Получить награду</Button>
              </div>
            )}

            {/* Failed state */}
            {status === 'failed' && (
              <div className="text-center py-6">
                <h3 className="text-xl font-bold mb-2">Время вышло!</h3>
                <p className="mb-4">
                  Вы сделали {tapCount.toLocaleString()} тапов из{' '}
                  {TARGET_TAPS.toLocaleString()}. Попробуйте снова!
                </p>
                <Button onClick={handleReset}>Попробовать снова</Button>
              </div>
            )}
          </CardContent>
          <CardFooter>
            {status === 'active' && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  if (
                    window.confirm(
                      'Вы уверены, что хотите выйти? Ваш прогресс будет сохранен.'
                    )
                  ) {
                    onExit();
                  }
                }}
              >
                Выйти (прогресс сохранится)
              </Button>
            )}
          </CardFooter>
        </Card>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};

export default BonusRoom;
