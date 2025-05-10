import React from "react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";

interface RoomCardProps {
  entryFee: number;
  playerCount: number;
  maxPlayers: number;
  status: "waiting" | "active" | "finished";
  onClick: () => void;
}

const RoomCard = ({
  entryFee = 20,
  playerCount = 0,
  maxPlayers = 10,
  status = "waiting",
  onClick = () => {},
}: RoomCardProps) => {
  return (
    <Card
      className="w-full cursor-pointer hover:shadow-lg transition-shadow bg-[#10B981] text-white rounded-xl overflow-hidden"
      onClick={onClick}
    >
      <CardContent className="p-4 flex flex-col justify-center items-center h-full">
        <div className="text-center">
          <h3 className="text-3xl font-bold mb-1">{entryFee} ⭐</h3>
          {status === "waiting" && (
            <p className="text-sm font-medium">Вход в комнату</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface RoomGridProps {
  rooms?: Array<{
    id: string;
    entryFee: number;
    playerCount: number;
    maxPlayers: number;
    status: "waiting" | "active" | "finished";
  }>;
  onRoomSelect?: (roomId: string) => void;
}

const RoomGrid = ({
  rooms = [
    {
      id: "1",
      entryFee: 20,
      playerCount: 3,
      maxPlayers: 10,
      status: "waiting",
    },
    {
      id: "2",
      entryFee: 50,
      playerCount: 5,
      maxPlayers: 10,
      status: "waiting",
    },
    {
      id: "3",
      entryFee: 80,
      playerCount: 10,
      maxPlayers: 10,
      status: "waiting",
    },
    {
      id: "4",
      entryFee: 100,
      playerCount: 2,
      maxPlayers: 10,
      status: "waiting",
    },
    {
      id: "5",
      entryFee: 150,
      playerCount: 0,
      maxPlayers: 10,
      status: "waiting",
    },
    {
      id: "6",
      entryFee: 200,
      playerCount: 8,
      maxPlayers: 10,
      status: "waiting",
    },
  ],
  onRoomSelect = () => {},
}: RoomGridProps) => {
  return (
    <div className="w-full bg-[#FFCA28] p-4 min-h-screen">
      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
        {rooms.map((room) => (
          <RoomCard
            key={room.id}
            entryFee={room.entryFee}
            playerCount={room.playerCount}
            maxPlayers={room.maxPlayers}
            status={room.status}
            onClick={() => onRoomSelect(room.id)}
          />
        ))}
      </div>
    </div>
  );
};

export default RoomGrid;
