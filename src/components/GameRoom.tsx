import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useRealtime } from '../hooks/useRealtime';
import { useApiRequest } from '../hooks/useApiRequest';
import { useTelegram } from '../hooks/useTelegram';
import { roomApi } from '../services/api';
import BottomNavigation from './BottomNavigation';
import UserHeader from './UserHeader';
import { motion } from 'framer-motion';

interface Player {
  id: string;
  username: string;
  avatar: string;
  taps: number;
  progress: number;
}

interface GameState {
  status: 'waiting' | 'countdown' | 'active' | 'finished' | 'tiebreaker';
  players: Player[];
  countdown: number;
  timeRemaining: number;
  winner?: Player;
  roomType?: 'standard' | 'bonus' | 'hero';
  roomKey?: string;
  entryFee?: number;
  tiebreaker?: {
    gameId: string;
    players: string[];
  };
}

export function GameRoom() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const [gameState, setGameState] = useState<GameState>({
    status: 'waiting',
    players: [],
    countdown: 3,
    timeRemaining: 30, // Hero rooms have 30 second rounds
  });
  const [localTaps, setLocalTaps] = useState(0);
  const [isJoined, setIsJoined] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [showPreCountdown, setShowPreCountdown] = useState(false);
  const [preCountdown, setPreCountdown] = useState(30); // 30 second pre-game countdown
  const tapButtonRef = useRef<HTMLButtonElement>(null);
  const tapIntervalRef = useRef<number | null>(null);

  const { subscribeToChannel, unsubscribeFromChannel, publishToChannel } =
    useRealtime(`room-${roomId || 'default'}`, {
      tableName: 'rooms',
      filter: 'id',
      filterValue: roomId,
    });
  const { fetchData } = useApiRequest();
  const { user, appUser } = useTelegram();

  // Join room effect
  useEffect(() => {
    if (roomId && appUser?.id && !isJoined) {
      const joinRoom = async () => {
        try {
          // Check if this is a room key (6 characters) or a room ID (UUID)
          const isRoomKey = roomId.length === 6;

          let response;
          if (isRoomKey) {
            response = await roomApi.joinRoomByKey(roomId, appUser.id);
            if (response && response.room) {
              // Redirect to the actual room ID URL
              navigate(`/game-room/${response.room.id}`, { replace: true });
              return;
            }
          } else {
            response = await roomApi.joinRoom(roomId, appUser.id);
          }

          if (response) {
            setIsJoined(true);

            // Check if user is the creator
            const room = response.room || {};
            if (room.creator_id === appUser.id) {
              setIsCreator(true);
            }

            // Initialize with current room state
            setGameState(prev => ({
              ...prev,
              players: response.participants || [],
              status: room.status || 'waiting',
              roomType: room.type,
              roomKey: room.room_key,
              entryFee: room.entry_fee,
            }));
          }
        } catch (error: any) {
          console.error('Failed to join room:', error);

          // Handle specific errors
          if (
            error.message &&
            error.message.includes('Организатор не запустил игру')
          ) {
            alert(
              'Организатор не запустил игру вовремя. Свяжитесь с организатором или введите другой ключ.'
            );
            navigate('/');
          } else if (
            error.message &&
            error.message.includes('Insufficient balance')
          ) {
            alert('Недостаточно Stars для входа в комнату. Пополните баланс.');
            navigate('/');
          } else {
            alert(
              'Не удалось войти в комнату: ' +
                (error.message || 'Неизвестная ошибка')
            );
            navigate('/');
          }
        }
      };

      joinRoom();
    }
  }, [roomId, appUser, isJoined, navigate]);

  // Определяем handleGameEnd до его использования в useEffect
  const handleGameEnd = async (winner?: Player) => {
    if (!roomId || !appUser) return;

    try {
      await fetchData(`/api/games/${roomId}/end`, {
        method: 'POST',
        body: JSON.stringify({
          userId: appUser.id,
          taps: localTaps,
        }),
      });
    } catch (error) {
      console.error('Failed to submit final score:', error);
    }
  };

  // Subscribe to room updates
  useEffect(() => {
    if (roomId && isJoined) {
      const handleRoomUpdate = (update: any) => {
        setGameState(prevState => {
          // Handle game state transitions
          if (update.status === 'finished' && prevState.status !== 'finished') {
            // Game just finished
            handleGameEnd(update.winner);
          } else if (
            update.status === 'active' &&
            prevState.status === 'waiting'
          ) {
            // Game is starting, show pre-countdown
            setShowPreCountdown(true);
            setPreCountdown(30);
          } else if (update.tiebreaker && !prevState.tiebreaker) {
            // Tiebreaker initiated
            return {
              ...prevState,
              ...update,
              status: 'tiebreaker',
              tiebreaker: update.tiebreaker,
            };
          }

          return {
            ...prevState,
            ...update,
          };
        });
      };

      subscribeToChannel(`room:${roomId}`, handleRoomUpdate);

      return () => {
        unsubscribeFromChannel(`room:${roomId}`);
      };
    }
  }, [
    roomId,
    isJoined,
    subscribeToChannel,
    unsubscribeFromChannel,
    handleGameEnd,
    appUser,
    fetchData,
    localTaps,
  ]);

  // Pre-game countdown timer effect (30 seconds)
  useEffect(() => {
    if (showPreCountdown && preCountdown > 0) {
      const timer = setTimeout(() => {
        setPreCountdown(prev => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    } else if (showPreCountdown && preCountdown === 0) {
      // Transition to 3-2-1 countdown
      setShowPreCountdown(false);
      setGameState(prev => ({
        ...prev,
        status: 'countdown',
        countdown: 3,
      }));
    }
  }, [showPreCountdown, preCountdown]);

  // Final 3-2-1 countdown timer effect
  useEffect(() => {
    if (gameState.status === 'countdown' && gameState.countdown > 0) {
      const timer = setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          countdown: prev.countdown - 1,
        }));
      }, 1000);

      return () => clearTimeout(timer);
    } else if (gameState.status === 'countdown' && gameState.countdown === 0) {
      // Transition to active game
      setGameState(prev => ({
        ...prev,
        status: 'active',
      }));
    }
  }, [gameState.status, gameState.countdown]);

  // Game timer effect
  useEffect(() => {
    if (gameState.status === 'active' && gameState.timeRemaining > 0) {
      const timer = setTimeout(() => {
        setGameState(prev => ({
          ...prev,
          timeRemaining: prev.timeRemaining - 1,
        }));
      }, 1000);

      return () => clearTimeout(timer);
    } else if (gameState.status === 'active' && gameState.timeRemaining === 0) {
      // Game time's up
      setGameState(prev => ({
        ...prev,
        status: 'finished',
      }));

      // Clear tap interval
      if (tapIntervalRef.current) {
        clearInterval(tapIntervalRef.current);
        tapIntervalRef.current = null;
      }

      // Send final score to server
      sendTapUpdate(localTaps);
    }
  }, [gameState.status, gameState.timeRemaining]);

  // Haptic feedback effect for taps
  useEffect(() => {
    // Add haptic feedback when tapping
    const handleTapWithHaptic = (e: MouseEvent) => {
      if (
        gameState.status === 'active' &&
        tapButtonRef.current?.contains(e.target as Node)
      ) {
        // Try to use Telegram's haptic feedback if available
        if (window.Telegram?.WebApp?.HapticFeedback) {
          window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
        }
      }
    };

    document.addEventListener('mousedown', handleTapWithHaptic);

    return () => {
      document.removeEventListener('mousedown', handleTapWithHaptic);
    };
  }, [gameState.status]);

  // Handle tap action
  const handleTap = () => {
    if (gameState.status !== 'active') return;

    const newTaps = localTaps + 1;
    setLocalTaps(newTaps);

    // Update progress locally for smoother UX
    const localProgress = Math.min((newTaps / 200) * 100, 100); // 200 taps to win
    updateLocalPlayerProgress(localProgress);

    // Set up interval for sending taps if not already set
    if (!tapIntervalRef.current) {
      tapIntervalRef.current = window.setInterval(() => {
        sendTapUpdate(localTaps);
      }, 50); // Send update every 50ms
    }
  };

  // Update local player's progress without waiting for server
  const updateLocalPlayerProgress = (progress: number) => {
    if (!appUser) return;

    setGameState(prev => ({
      ...prev,
      players: prev.players.map(player =>
        player.id === appUser.id
          ? { ...player, progress, taps: localTaps }
          : player
      ),
    }));
  };

  // Send tap update to server
  const sendTapUpdate = (taps: number) => {
    if (!roomId || !appUser) return;

    publishToChannel(`room:${roomId}:taps`, {
      userId: appUser.id,
      taps,
      progress: Math.min((taps / 200) * 100, 100), // 200 taps to win
    });
  };

  // Start game function
  const startGame = async () => {
    if (!roomId || !appUser) return;

    try {
      await roomApi.startGame(roomId);
      setGameState(prev => ({
        ...prev,
        status: 'countdown',
      }));
    } catch (error) {
      console.error('Failed to start game:', error);
    }
  };

  // Render waiting room
  const renderWaitingRoom = () => (
    <div className="flex flex-col items-center justify-center h-full p-4">
      <h2 className="text-2xl font-bold mb-6">Waiting for players...</h2>

      <div className="flex flex-wrap justify-center gap-4 mb-8">
        {gameState.players.map(player => (
          <div key={player.id} className="flex flex-col items-center">
            <img
              src={
                player.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.id}`
              }
              alt={player.username}
              className="w-16 h-16 rounded-full mb-2"
            />
            <span className="text-sm">{player.username}</span>
          </div>
        ))}
      </div>

      {/* Only show start button to room creator */}
      {isCreator && (
        <Button
          onClick={startGame}
          className="bg-[#FFCA28] hover:bg-[#FFB300] text-black"
        >
          Start Game
        </Button>
      )}
    </div>
  );

  // Render countdown
  const renderCountdown = () => {
    // Map countdown number to text
    let countdownText = '';
    if (gameState.countdown === 3) countdownText = 'На старт';
    else if (gameState.countdown === 2) countdownText = 'Внимание';
    else if (gameState.countdown === 1) countdownText = 'TAP';

    return (
      <div className="flex flex-col items-center justify-center h-full">
        <motion.div
          key={gameState.countdown}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          className="text-6xl font-bold mb-4"
        >
          {countdownText || gameState.countdown}
        </motion.div>
      </div>
    );
  };

  // Render active game
  const renderActiveGame = () => (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-between p-4">
        <div className="w-full">
          <h2 className="text-xl font-bold mb-2">
            Time: {gameState.timeRemaining}s
          </h2>

          {/* Player progress bars */}
          <div className="space-y-4 mb-6">
            {gameState.players.map(player => (
              <div key={player.id} className="flex items-center gap-2">
                <img
                  src={
                    player.avatar ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.id}`
                  }
                  alt={player.username}
                  className="w-8 h-8 rounded-full"
                />
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>{player.username}</span>
                    <span>{player.taps} taps</span>
                  </div>
                  <Progress value={player.progress} className="h-2" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tap button */}
        <Button
          onClick={handleTap}
          className="w-40 h-40 rounded-full bg-[#FFCA28] hover:bg-[#FFB300] text-black text-2xl font-bold mb-8"
        >
          TAP!
        </Button>
      </div>
    </div>
  );

  // Render game results
  const renderGameResults = () => {
    // Sort players by taps in descending order
    const sortedPlayers = [...gameState.players].sort(
      (a, b) => b.taps - a.taps
    );
    const winner = sortedPlayers[0];

    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <h2 className="text-2xl font-bold mb-6">Game Over!</h2>

        {winner && (
          <div className="flex flex-col items-center mb-8">
            <img
              src={
                winner.avatar ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${winner.id}`
              }
              alt={winner.username}
              className="w-24 h-24 rounded-full mb-2"
            />
            <h3 className="text-xl font-bold">{winner.username} wins!</h3>
            <p className="text-lg">{winner.taps} taps</p>
          </div>
        )}

        <div className="w-full max-w-md">
          <h3 className="text-lg font-bold mb-2">Final Results:</h3>
          <div className="space-y-2">
            {sortedPlayers.map((player, index) => (
              <div
                key={player.id}
                className="flex items-center gap-2 p-2 rounded bg-white/10"
              >
                <span className="font-bold">{index + 1}.</span>
                <img
                  src={
                    player.avatar ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${player.id}`
                  }
                  alt={player.username}
                  className="w-8 h-8 rounded-full"
                />
                <span className="flex-1">{player.username}</span>
                <span className="font-bold">{player.taps} taps</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4 mt-8">
          <Button
            onClick={() => navigate('/')}
            className="bg-[#FFCA28] hover:bg-[#FFB300] text-black"
          >
            В лобби
          </Button>
          {gameState.roomType === 'standard' && (
            <Button
              onClick={() => navigate(`/game-room/${roomId}`)}
              className="bg-[#FF7043] hover:bg-[#FF5722] text-white"
            >
              Сыграть ещё
            </Button>
          )}
        </div>
      </div>
    );
  };

  // Render based on game state
  const renderGameContent = () => {
    switch (gameState.status) {
      case 'waiting':
        return renderWaitingRoom();
      case 'countdown':
        return renderCountdown();
      case 'active':
        return renderActiveGame();
      case 'finished':
        return renderGameResults();
      default:
        return <div>Loading...</div>;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#1E88E5] text-white">
      <UserHeader />
      <div className="flex-1 overflow-y-auto">{renderGameContent()}</div>
      <BottomNavigation />
    </div>
  );
}

// Add default export for the component
export default GameRoom;