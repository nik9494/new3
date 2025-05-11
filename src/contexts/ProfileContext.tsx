import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useTelegram } from '../hooks/useTelegram';
import { useApiRequest } from '../hooks/useApiRequest';

export interface ProfileData {
  user: {
    id: string;
    username: string;
    telegram_id: number;
    photo_url?: string;
    balance_stars: number;
    has_ton_wallet: boolean;
  };
  wallet: string | null;
  stats: {
    games_played: number;
    games_won: number;
    total_earned: number;
    win_rate: number;
  };
  referral: {
    code: string | null;
    uses: Array<{ username: string; used_at: string; games_played: number; bonus_earned: number }>;
  };
}

interface ProfileContextType {
  profile: ProfileData | null;
  refreshProfile: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useTelegram();
  const { fetchData } = useApiRequest(); // fetchData теперь стабильна благодаря useCallback
  const [profile, setProfile] = useState<ProfileData | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    try {
      const resp = await fetchData<ProfileData>(`/api/users/telegram/${user.id}`);
      if (resp.success && resp.data) {
        setProfile(resp.data);
        localStorage.setItem('userId', resp.data.user.id);
      }
    } catch (e) {
      console.error('Ошибка загрузки профиля:', e);
    }
  }, [user?.id, fetchData]); // fetchData теперь стабильна

  // Начальная загрузка профиля
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return (
    <ProfileContext.Provider value={{ profile, refreshProfile: loadProfile }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = (): ProfileContextType => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};