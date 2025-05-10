import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * React hook for subscribing to real-time updates via Socket.IO
 */
export function useRealtime<T>(
  channel: string,
  options?: {
    tableName?: string;
    filter?: string;
    filterValue?: string;
  }
): {
  data: T[];
  isLoading: boolean;
  error: Error | null;
  sendMessage: (payload: any) => void;
  subscribe: (handler: (msg: T) => void) => () => void;
  publishToChannel: (eventName: string, payload: any) => void;
  subscribeToChannel: (eventName: string, handler: (data: any) => void) => void;
  unsubscribeFromChannel: (eventName: string) => void;
} {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const socketRef = useRef<Socket>();
  const handlersRef = useRef<Record<string, (data: any) => void>>({});

  // Initialize socket and join channel
  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3001', {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      socket.emit('joinRoom', { channel, ...options });
      setIsLoading(false);
    });

    socket.on('connect_error', err => {
      console.error('Socket connection error:', err);
      setError(new Error(`Socket connection error: ${err.message}`));
      setIsLoading(false);
    });

    socket.on('disconnect', reason => {
      console.log('Socket disconnected:', reason);
      if (reason === 'io server disconnect') {
        // the disconnection was initiated by the server, reconnect manually
        socket.connect();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [channel, options]);

  // send a message to the channel
  const sendMessage = useCallback(
    (payload: any) => {
      socketRef.current?.emit('message', { channel, payload });
    },
    [channel]
  );

  // subscribe to incoming messages
  const subscribe = useCallback((handler: (msg: T) => void) => {
    const socket = socketRef.current;
    if (!socket) return () => {};

    const listener = (msg: T) => {
      try {
        handler(msg);
      } catch (e) {
        console.error('Error in realtime handler:', e);
      }
    };

    socket.on('update', listener);
    return () => {
      socket.off('update', listener);
    };
  }, []);

  // Subscribe to a specific channel event
  const subscribeToChannel = useCallback(
    (eventName: string, handler: (data: any) => void) => {
      const socket = socketRef.current;
      if (!socket) return;

      const fullEventName = `${channel}:${eventName}`;

      // Store the handler reference
      handlersRef.current[fullEventName] = handler;

      socket.on(fullEventName, handler);
    },
    [channel]
  );

  // Unsubscribe from a specific channel event
  const unsubscribeFromChannel = useCallback(
    (eventName: string) => {
      const socket = socketRef.current;
      if (!socket) return;

      const fullEventName = `${channel}:${eventName}`;
      const handler = handlersRef.current[fullEventName];

      if (handler) {
        socket.off(fullEventName, handler);
        delete handlersRef.current[fullEventName];
      }
    },
    [channel]
  );

  // Publish to a specific channel event
  const publishToChannel = useCallback(
    (eventName: string, payload: any) => {
      const socket = socketRef.current;
      if (!socket) return;

      socket.emit('publish', {
        channel,
        event: eventName,
        payload,
      });
    },
    [channel]
  );

  return {
    data,
    isLoading,
    error,
    sendMessage,
    subscribe,
    publishToChannel,
    subscribeToChannel,
    unsubscribeFromChannel,
  };
}

/**
 * Hook specialized for game room updates
 */
export function useGameRealtime(roomId: string) {
  interface Player {
    id: string;
    username: string;
    avatar: string;
    taps: number;
    progress: number;
  }
  interface GameState {
    status: 'waiting' | 'countdown' | 'active' | 'finished';
    players: Player[];
    countdown: number;
    timeRemaining: number;
    winner?: Player;
  }

  const [gameState, setGameState] = useState<GameState>({
    status: 'waiting',
    players: [],
    countdown: 3,
    timeRemaining: 60,
  });

  const { subscribe, sendMessage, subscribeToChannel, publishToChannel } =
    useRealtime<any>(`room-${roomId}`, {
      tableName: 'rooms',
      filter: 'id',
      filterValue: roomId,
    });

  // subscribe to server updates
  useEffect(() => {
    const unsub = subscribe(update => {
      setGameState(prev => ({ ...prev, ...update }));
    });

    // Subscribe to specific game events
    subscribeToChannel('player_joined', player => {
      setGameState(prev => ({
        ...prev,
        players: [...prev.players, player],
      }));
    });

    subscribeToChannel('game_start', data => {
      setGameState(prev => ({
        ...prev,
        status: 'countdown',
        countdown: 3,
      }));
    });

    subscribeToChannel('game_end', data => {
      setGameState(prev => ({
        ...prev,
        status: 'finished',
        winner: data.winner,
      }));
    });

    return unsub;
  }, [subscribe, subscribeToChannel]);

  // helper to send taps
  const sendTaps = useCallback(
    (userId: string, taps: number) => {
      publishToChannel('taps', { userId, taps });
    },
    [publishToChannel]
  );

  return { gameState, sendTaps };
}
