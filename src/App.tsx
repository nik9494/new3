import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/home';
import GameRoom from './components/GameRoom';

// Lazy load pages for better performance
const Profile = lazy(() => import('./pages/Profile'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const CreateRoom = lazy(() => import('./pages/CreateRoom'));
const BonusRoom = lazy(() => import('./components/BonusRoom'));

function App() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-[#FFCA28]">
          Загрузка...
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/create-room" element={<CreateRoom />} />
        <Route path="/bonus-room" element={<BonusRoom />} />
        <Route path="/game-room/:roomId" element={<GameRoom />} />
        {import.meta.env.VITE_TEMPO === 'true' && <Route path="/tempobook/*" />}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default App;
