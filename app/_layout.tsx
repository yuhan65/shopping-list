import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import {
  LibreBaskerville_400Regular,
  LibreBaskerville_400Regular_Italic,
  LibreBaskerville_700Bold,
} from '@expo-google-fonts/libre-baskerville';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { supabase } from '@/lib/supabase';
import { seedRecipes } from '@/lib/seedRecipes';

export { ErrorBoundary } from 'expo-router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 2 },
  },
});

SplashScreen.preventAutoHideAsync();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const hasSupabaseConfig =
  !!supabaseUrl &&
  !supabaseUrl.includes('placeholder') &&
  !supabaseUrl.includes('your-');

function useProtectedRoute() {
  const segments = useSegments();
  const router = useRouter();
  const { session, isLoading, isOnboarded, isDemoMode } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      if (isDemoMode) return;
      router.replace('/(auth)/onboarding');
    } else if (session && !isOnboarded) {
      if (segments.join('/') !== '(auth)/onboarding') {
        router.replace('/(auth)/onboarding');
      }
    } else if (session && isOnboarded && inAuthGroup) {
      router.replace('/(tabs)/plan');
    }
  }, [session, isLoading, isOnboarded, isDemoMode, segments]);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const setSession = useAuthStore((s) => s.setSession);
  const setIsOnboarded = useAuthStore((s) => s.setIsOnboarded);
  const enableDemoMode = useAuthStore((s) => s.enableDemoMode);

  const [loaded] = useFonts({
    LibreBaskerville_400Regular,
    LibreBaskerville_400Regular_Italic,
    LibreBaskerville_700Bold,
  });

  useEffect(() => {
    if (!hasSupabaseConfig) {
      Promise.all([
        useLocalDataStore.getState().hydrate(),
        enableDemoMode(),
      ]).then(() => {
        const store = useLocalDataStore.getState();
        const existing = store.query('recipes');
        if (existing.length === 0) {
          seedRecipes.forEach((recipe) => store.insert('recipes', recipe as any));
        }
      });
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        supabase
          .from('profiles')
          .select('id')
          .eq('user_id', session.user.id)
          .single()
          .then(({ data }) => {
            setIsOnboarded(!!data);
          });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  useProtectedRoute();

  if (!loaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="recipe" options={{ headerShown: false }} />
          <Stack.Screen name="meal-plan" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="camera" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="body-log" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="pantry" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="profile" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="food-log" options={{ headerShown: false, presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
