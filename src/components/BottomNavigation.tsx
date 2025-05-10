import React from "react";
import { Home, Trophy, User, Plus } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

interface BottomNavigationProps {
  className?: string;
}

const BottomNavigation: React.FC<BottomNavigationProps> = ({
  className = "",
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const navItems = [
    { icon: Home, label: "Главная", path: "/" },
    { icon: Trophy, label: "Рейтинг", path: "/leaderboard" },
    { icon: User, label: "Профиль", path: "/profile" },
    { icon: Plus, label: "Создать", path: "/create-room" },
  ];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 h-16 bg-[#FF7043] border-t border-white flex items-center justify-around px-2 ${className}`}
    >
      {navItems.map((item) => {
        const isActive = currentPath === item.path;
        return (
          <button
            key={item.label}
            className={`flex flex-col items-center justify-center w-1/4 h-full ${isActive ? "text-white font-bold" : "text-white/80"}`}
            onClick={() => navigate(item.path)}
            aria-label={item.label}
          >
            <item.icon className="h-5 w-5 mb-1" />
            <span className="text-xs">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default BottomNavigation;
