import React from 'react';
import { useNavigate } from 'react-router-dom';
import RoomGrid from './RoomGrid';
import UserHeader from './UserHeader';
import BottomNavigation from './BottomNavigation';
import useTelegram from '../hooks/useTelegram';
import { Button } from './ui/button';
import { Award } from 'lucide-react';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { appUser, user } = useTelegram();

  return (
    <div className="flex flex-col min-h-screen bg-[#FFCA28]">
      {/* Main Content */}
      <main className="flex-1">
        {/* Bonus Room Button */}
        <div className="p-4">
          <Button
            onClick={() => navigate('/bonus-room')}
            className="w-full bg-[#FF7043] hover:bg-[#FF5722] text-white flex items-center justify-center gap-2 py-6"
          >
            <Award className="h-5 w-5" />
            <span>Бонусная комната (10 млн тапов за 24ч)</span>
          </Button>
        </div>

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