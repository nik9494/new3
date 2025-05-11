import React, { useState, useEffect, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useProfile } from "../contexts/ProfileContext";
import { useTelegram } from "../hooks/useTelegram";

const UserHeader: React.FC = () => {
  const { profile } = useProfile();
  const { user } = useTelegram();

  // Username comes from profile if available, otherwise fallback to Telegram or default
  const username = profile?.user.username || user?.username || "Player";

  // Avatar URL from Telegram WebApp if available, otherwise generated
  const avatarUrl = user?.photo_url ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

  const starsBalance = profile?.user.balance_stars || 0;

  const [displayBalance, setDisplayBalance] = useState(0);
  const prevBalanceRef = useRef<number>(0);

  useEffect(() => {
    let animationFrame: number;
    const start = prevBalanceRef.current;
    const end = starsBalance;
    const duration = 1000;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.floor(start + (end - start) * progress);
      setDisplayBalance(value);
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        prevBalanceRef.current = end;
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [starsBalance]);

  return (
    <div className="w-full h-[70px] px-4 py-2 flex items-center justify-between bg-[#FF7043] text-white">
      <div className="flex items-center gap-3">
        <Avatar className="border-2 border-white">
          <AvatarImage src={avatarUrl} alt={username} />
          <AvatarFallback className="bg-white text-[#FF7043]">
            {username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="font-bold text-lg">{username}</span>
      </div>

      <div className="flex items-center">
        <Badge
          variant="outline"
          className="px-3 py-1 text-sm font-bold bg-white text-[#FF7043] border-white"
        >
          {displayBalance} ⭐
        </Badge>
      </div>
    </div>
  );
};

export default UserHeader;
