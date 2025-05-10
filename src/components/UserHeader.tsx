import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface UserHeaderProps {
  username?: string;
  avatarUrl?: string;
  starsBalance?: number;
}

const UserHeader = ({
  username = "Player",
  avatarUrl = "https://api.dicebear.com/7.x/avataaars/svg?seed=default",
  starsBalance = 0,
}: UserHeaderProps) => {
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
          {starsBalance} ⭐
        </Badge>
      </div>
    </div>
  );
};

export default UserHeader;
