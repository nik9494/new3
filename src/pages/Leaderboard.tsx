import React, { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import BottomNavigation from "@/components/BottomNavigation";
import useTelegram from "@/hooks/useTelegram";

interface LeaderboardEntry {
  id: string;
  rank: number;
  username: string;
  avatar: string;
  stars_won: number;
  games_won: number;
}

const Leaderboard: React.FC = () => {
  const { user } = useTelegram();
  const [period, setPeriod] = useState<"day" | "week" | "all">("day");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setIsLoading(true);
      try {
        // This would be an API call in a real app
        // const response = await fetch(`/api/leaderboard?period=${period}`);
        // const data = await response.json();
        // setLeaderboard(data);

        // Mock data
        setTimeout(() => {
          const mockData: LeaderboardEntry[] = [
            {
              id: "1",
              rank: 1,
              username: "Чемпион",
              avatar:
                "https://api.dicebear.com/7.x/avataaars/svg?seed=champion",
              stars_won: 5000,
              games_won: 25,
            },
            {
              id: "2",
              rank: 2,
              username: "ТапМастер",
              avatar:
                "https://api.dicebear.com/7.x/avataaars/svg?seed=tapmaster",
              stars_won: 3500,
              games_won: 18,
            },
            {
              id: "3",
              rank: 3,
              username: "СкоростнойТап",
              avatar:
                "https://api.dicebear.com/7.x/avataaars/svg?seed=speedtap",
              stars_won: 2800,
              games_won: 14,
            },
            {
              id: "4",
              rank: 4,
              username: "ПроТаппер",
              avatar:
                "https://api.dicebear.com/7.x/avataaars/svg?seed=protapper",
              stars_won: 2200,
              games_won: 11,
            },
            {
              id: "5",
              rank: 5,
              username: "БыстрыеПальцы",
              avatar:
                "https://api.dicebear.com/7.x/avataaars/svg?seed=fastfingers",
              stars_won: 1800,
              games_won: 9,
            },
            {
              id: "6",
              rank: 6,
              username: "ТапНинзя",
              avatar:
                "https://api.dicebear.com/7.x/avataaars/svg?seed=tapninja",
              stars_won: 1500,
              games_won: 8,
            },
            {
              id: "7",
              rank: 7,
              username: "МегаТап",
              avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=megatap",
              stars_won: 1200,
              games_won: 6,
            },
            {
              id: "8",
              rank: 8,
              username: "ТапКороль",
              avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=tapking",
              stars_won: 1000,
              games_won: 5,
            },
            {
              id: "9",
              rank: 9,
              username: "СуперТаппер",
              avatar:
                "https://api.dicebear.com/7.x/avataaars/svg?seed=supertapper",
              stars_won: 800,
              games_won: 4,
            },
            {
              id: "10",
              rank: 10,
              username: "ТапГерой",
              avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=taphero",
              stars_won: 600,
              games_won: 3,
            },
          ];

          // Add more entries for week and all time periods
          if (period === "week") {
            mockData.forEach((entry) => {
              entry.stars_won = Math.floor(entry.stars_won * 1.5);
              entry.games_won = Math.floor(entry.games_won * 1.5);
            });
          } else if (period === "all") {
            mockData.forEach((entry) => {
              entry.stars_won = Math.floor(entry.stars_won * 3);
              entry.games_won = Math.floor(entry.games_won * 3);
            });
          }

          setLeaderboard(mockData);
          setIsLoading(false);
        }, 500);
      } catch (error) {
        console.error("Error fetching leaderboard:", error);
        setIsLoading(false);
      }
    };

    fetchLeaderboard();
  }, [period]);

  const handlePeriodChange = (value: string) => {
    setPeriod(value as "day" | "week" | "all");
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#FFCA28]">
      {/* Main Content */}
      <main className="flex-1 p-4 pb-20">
        <h1 className="text-2xl font-bold mb-4 text-center">Рейтинг игроков</h1>

        <Tabs defaultValue="day" onValueChange={handlePeriodChange}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="day">Сегодня</TabsTrigger>
            <TabsTrigger value="week">Неделя</TabsTrigger>
            <TabsTrigger value="all">Все время</TabsTrigger>
          </TabsList>

          {["day", "week", "all"].map((tabValue) => (
            <TabsContent key={tabValue} value={tabValue} className="mt-4">
              {isLoading ? (
                <div className="flex justify-center items-center py-10">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((entry) => (
                    <div
                      key={entry.id}
                      className={`flex items-center p-3 rounded-lg ${entry.rank === 1 ? "bg-yellow-100 border border-yellow-300" : entry.rank === 2 ? "bg-gray-100 border border-gray-300" : entry.rank === 3 ? "bg-amber-100 border border-amber-300" : "bg-white border border-gray-200"}`}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold mr-3">
                        {entry.rank}
                      </div>
                      <Avatar className="h-10 w-10 mr-3">
                        <AvatarImage src={entry.avatar} alt={entry.username} />
                        <AvatarFallback>
                          {entry.username.substring(0, 2)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{entry.username}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.games_won} побед
                        </p>
                      </div>
                      <Badge className="ml-2 text-lg py-1 px-3">
                        {entry.stars_won} ⭐
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};

export default Leaderboard;
