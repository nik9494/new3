import React from 'react';
import { useNavigate } from 'react-router-dom';
import RoomGrid from './RoomGrid';
import UserHeader from './UserHeader';
import BottomNavigation from './BottomNavigation';
import useTelegram from '../hooks/useTelegram';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { appUser, user } = useTelegram();

  return (
    <div className="flex flex-col min-h-screen bg-[#FFCA28]">
      {/* User Header */}
      <UserHeader
        username={appUser?.username || user?.first_name || 'Player'}
        avatarUrl={
          user?.photo_url ||
          'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix'
        }
        starsBalance={appUser?.balance_stars || 0}
      />

      {/* Main Content */}
      <main className="flex-1">
        {/* Room Grid Component with navigation callback */}
        <RoomGrid
          onRoomSelect={(roomId: string) => {
            navigate(`/game-room/${roomId}`);
          }}
        />
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};

export default Home;
