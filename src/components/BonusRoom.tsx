import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { Card } from './ui/card';
import { useApiRequest } from '../hooks/useApiRequest';
import { useTelegram } from '../hooks/useTelegram';
import BottomNavigation from './BottomNavigation';
import UserHeader from './UserHeader';
import { motion } from 'framer-motion';

const BonusRoom: React.FC = () => {
  const navigate = useNavigate();
  const { appUser } = useTelegram();
  const { fetchData } = useApiRequest();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bonusState, setBonusState] = useState({
    taps_so_far: 0,
    start_time: null as string | null,
    end_time: null as string | null,
    completed: false,
    target_taps: 10000000, // 10 million taps
    time_remaining_ms: 0,
    time_limit_ms: 24 * 60 * 60 * 1000, // 24 hours
    reward: 3000, // 3000 Stars
  });
  const [localTaps, setLocalTaps] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [showCountdown, setShowCountdown] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [countdownText, setCountdownText] = useState('');
  const [gameTimer, setGameTimer] = useState(30); // 30 second game session
  const tapButtonRef = useRef<HTMLButtonElement>(null);
  const tapIntervalRef = useRef<number | null>(null);
  const lastTapBatchRef = useRef<number>(0);

  // Load bonus progress
  useEffect(() => {
    if (appUser?.id) {
      loadBonusProgress();
    }
  }, [appUser]);

  const loadBonusProgress = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetchData(`/api/bonus/user/${appUser?.id}`);
      if (response.success && response.data) {
        setBonusState(response.data);

        // If there's an active challenge, set local taps
        if (
          response.data.start_time &&
          !response.data.end_time &&
          !response.data.completed
        ) {
          setLocalTaps(response.data.taps_so_far);
        }
      }
    } catch (err) {
      console.error('Error loading bonus progress:', err);
      setError('Не удалось загрузить прогресс бонусного задания');
    } finally {
      setIsLoading(false);
    }
  };

  // Start bonus challenge
  const startBonusChallenge = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetchData('/api/bonus/start', {
        method: 'POST',
        body: JSON.stringify({ user_id: appUser?.id }),
      });

      if (response.success && response.data) {
        setBonusState(response.data);
        setLocalTaps(0);
        // Start countdown
        startCountdown();
      }
    } catch (err) {
      console.error('Error starting bonus challenge:', err);
      setError('Не удалось начать бонусное задание');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset bonus challenge
  const resetBonusChallenge = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetchData('/api/bonus/reset', {
        method: 'POST',
        body: JSON.stringify({ user_id: appUser?.id }),
      });

      if (response.success) {
        loadBonusProgress();
      }
    } catch (err) {
      console.error('Error resetting bonus challenge:', err);
      setError('Не удалось сбросить бонусное задание');
    } finally {
      setIsLoading(false);
    }
  };

  // Start 3-2-1 countdown
  const startCountdown = () => {
    setShowCountdown(true);
    setCountdown(3);
    setCountdownText('На старт');
  };

  // Countdown effect
  useEffect(() => {
    if (!showCountdown) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);

        // Update countdown text
        if (countdown === 3) setCountdownText('На старт');
        if (countdown === 2) setCountdownText('Внимание');
        if (countdown === 1) setCountdownText('TAP');
      }, 1000);

      return () => clearTimeout(timer);
    } else {
      // Countdown finished, start the game
      setShowCountdown(false);
      setIsActive(true);
      setGameTimer(30); // 30 second game session
    }
  }, [showCountdown, countdown]);

  // Game timer effect
  useEffect(() => {
    if (isActive && gameTimer > 0) {
      const timer = setTimeout(() => {
        setGameTimer(prev => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (isActive && gameTimer === 0) {
      // Game session ended
      endGameSession();
    }
  }, [isActive, gameTimer]);

  // End game session
  const endGameSession = async () => {
    setIsActive(false);
    if (tapIntervalRef.current) {
      clearInterval(tapIntervalRef.current);
      tapIntervalRef.current = null;
    }

    // Send final tap count to server
    try {
      await sendTapUpdate();
      // Reload progress
      loadBonusProgress();
    } catch (err) {
      console.error('Error ending game session:', err);
    }
  };

  // Handle tap action
  const handleTap = () => {
    if (!isActive) return;

    // Increment local taps
    setLocalTaps(prev => prev + 1);

    // Set up interval for sending taps if not already set
    if (!tapIntervalRef.current) {
      tapIntervalRef.current = window.setInterval(() => {
        sendTapUpdate();
      }, 1000); // Send update every second
    }

    // Add haptic feedback if available
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
  };

  // Send tap update to server
  const sendTapUpdate = async () => {
    if (!appUser?.id || localTaps === lastTapBatchRef.current) return;

    try {
      const tapsToSend = localTaps - lastTapBatchRef.current;
      if (tapsToSend <= 0) return;

      await fetchData('/api/bonus/taps', {
        method: 'POST',
        body: JSON.stringify({
          user_id: appUser.id,
          taps: tapsToSend,
        }),
      });

      lastTapBatchRef.current = localTaps;
    } catch (err) {
      console.error('Error sending tap update:', err);
    }
  };

  // Format time remaining
  const formatTimeRemaining = (ms: number) => {
    if (!ms) return '00:00:00';

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0'),
    ].join(':');
  };

  // Calculate progress percentage
  const calculateProgress = () => {
    const totalTaps =
      bonusState.taps_so_far +
      (isActive ? localTaps - lastTapBatchRef.current : 0);
    return Math.min((totalTaps / bonusState.target_taps) * 100, 100);
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#1E88E5] text-white">
        <UserHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
        </div>
        <BottomNavigation />
      </div>
    );
  }

  // Render countdown overlay
  const renderCountdown = () => {
    if (!showCountdown) return null;

    return (
      <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-10">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          className="text-6xl font-bold text-white"
        >
          {countdownText}
        </motion.div>
      </div>
    );
  };

  // Render active game
  const renderActiveGame = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-between p-4">
        <div className="w-full">
          <h2 className="text-xl font-bold mb-2">Время: {gameTimer}с</h2>

          <div className="mb-6">
            <div className="flex justify-between text-sm mb-1">
              <span>Прогресс</span>
              <span>{localTaps} тапов</span>
            </div>
            <Progress value={(localTaps / 200) * 100} className="h-2" />
          </div>
        </div>

        {/* Tap button */}
        <Button
          ref={tapButtonRef}
          onClick={handleTap}
          className="w-40 h-40 rounded-full bg-[#FFCA28] hover:bg-[#FFB300] text-black text-2xl font-bold mb-8"
        >
          TAP!
        </Button>
      </div>
    </div>
  );

  // Render challenge status
  const renderChallengeStatus = () => {
    if (bonusState.completed) {
      return (
        <Card className="p-6 bg-green-500/20 backdrop-blur-sm">
          <h2 className="text-2xl font-bold mb-4 text-center">
            Задание выполнено!
          </h2>
          <p className="text-center mb-6">
            Вы успешно выполнили бонусное задание и получили {bonusState.reward}{' '}
            Stars!
          </p>
          <Button
            onClick={() => navigate('/')}
            className="w-full bg-[#FFCA28] hover:bg-[#FFB300] text-black"
          >
            Вернуться в лобби
          </Button>
        </Card>
      );
    }

    if (bonusState.start_time && !bonusState.end_time) {
      return (
        <Card className="p-6 bg-white/10 backdrop-blur-sm">
          <h2 className="text-2xl font-bold mb-4">Бонусное задание активно</h2>

          <div className="space-y-4 mb-6">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Прогресс</span>
                <span>
                  {bonusState.taps_so_far.toLocaleString()} /{' '}
                  {bonusState.target_taps.toLocaleString()} тапов
                </span>
              </div>
              <Progress value={calculateProgress()} className="h-2" />
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Осталось времени</span>
                <span>
                  {formatTimeRemaining(bonusState.time_remaining_ms || 0)}
                </span>
              </div>
              <Progress
                value={
                  100 -
                  ((bonusState.time_remaining_ms || 0) /
                    bonusState.time_limit_ms) *
                    100
                }
                className="h-2"
              />
            </div>
          </div>

          <div className="space-y-4">
            <Button
              onClick={startBonusChallenge}
              className="w-full bg-[#FFCA28] hover:bg-[#FFB300] text-black"
            >
              Продолжить задание
            </Button>

            <Button
              onClick={resetBonusChallenge}
              variant="outline"
              className="w-full"
            >
              Сбросить задание
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <Card className="p-6 bg-white/10 backdrop-blur-sm">
        <h2 className="text-2xl font-bold mb-4">Бонусное задание</h2>
        <p className="mb-6">
          Сделайте 10 000 000 тапов за 24 часа и получите 3 000 Stars!
        </p>
        <Button
          onClick={startBonusChallenge}
          className="w-full bg-[#FFCA28] hover:bg-[#FFB300] text-black"
        >
          Начать задание
        </Button>
      </Card>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#1E88E5] text-white relative">
      <UserHeader />

      {/* Countdown overlay */}
      {renderCountdown()}

      <div className="flex-1 p-4 flex items-center justify-center">
        {isActive ? (
          renderActiveGame()
        ) : (
          <div className="w-full max-w-md">{renderChallengeStatus()}</div>
        )}
      </div>

      <BottomNavigation />
    </div>
  );
};

export default BonusRoom;