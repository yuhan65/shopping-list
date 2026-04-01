import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDED_KEY = 'demo-is-onboarded';

interface AuthState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isOnboarded: boolean;
  isDemoMode: boolean;
  setSession: (session: Session | null) => void;
  setIsOnboarded: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  enableDemoMode: () => void;
}

const DEMO_USER: User = {
  id: 'demo-user-001',
  email: 'demo@mealmate.app',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as User;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  isLoading: true,
  isOnboarded: false,
  isDemoMode: false,
  setSession: (session) =>
    set({ session, user: session?.user ?? null, isLoading: false }),
  setIsOnboarded: (value) => {
    AsyncStorage.setItem(ONBOARDED_KEY, JSON.stringify(value)).catch(() => {});
    set({ isOnboarded: value });
  },
  setIsLoading: (value) => set({ isLoading: value }),
  enableDemoMode: async () => {
    set({
      isDemoMode: true,
      user: DEMO_USER,
      session: { user: DEMO_USER, access_token: 'demo', refresh_token: 'demo' } as Session,
    });
    try {
      const raw = await AsyncStorage.getItem(ONBOARDED_KEY);
      if (raw) set({ isOnboarded: JSON.parse(raw) });
    } catch {}
    set({ isLoading: false });
  },
}));
