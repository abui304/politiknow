import {
  Merriweather_400Regular,
  Merriweather_600SemiBold,
  Merriweather_700Bold,
  Merriweather_800ExtraBold,
  Merriweather_900Black,
  useFonts,
} from '@expo-google-fonts/merriweather';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Toaster } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { APP_MAX_WIDTH, colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Merriweather_400Regular,
    Merriweather_600SemiBold,
    Merriweather_700Bold,
    Merriweather_800ExtraBold,
    Merriweather_900Black,
  });
  const { hydrated, hydrate, accessToken, stage } = useAuth();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!accessToken) queryClient.clear();
  }, [accessToken]);

  const ready = fontsLoaded && hydrated;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;

  const signedIn = Boolean(accessToken);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.outer}>
          <View style={styles.app}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="welcome" />
                <Stack.Screen name="login" />
                <Stack.Screen name="register" />
              </Stack.Protected>
              <Stack.Protected guard={signedIn && stage === 'needs_name'}>
                <Stack.Screen name="onboarding/name" />
              </Stack.Protected>
              <Stack.Protected guard={signedIn && stage === 'needs_topics'}>
                <Stack.Screen name="onboarding/topics" />
              </Stack.Protected>
              <Stack.Protected guard={signedIn && stage === 'ready'}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="bill/[id]" />
                <Stack.Screen name="cosponsors/[id]" />
                <Stack.Screen name="legislator/[id]" />
                <Stack.Screen name="user/[id]" />
                <Stack.Screen name="settings" />
                <Stack.Screen name="calendar" />
                <Stack.Screen name="state/[code]" />
                <Stack.Screen name="state-map/[code]" />
                <Stack.Screen name="map" />
                <Stack.Screen name="moderation" />
              </Stack.Protected>
            </Stack>
            <Toaster />
          </View>
        </View>
      </SafeAreaProvider>
    </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: Platform.OS === 'web' ? '#F2E4CF' : colors.bg },
  // On desktop web, render the app as a centered phone-width column.
  app:
    Platform.OS === 'web'
      ? {
          flex: 1,
          width: '100%',
          maxWidth: APP_MAX_WIDTH,
          alignSelf: 'center',
          backgroundColor: colors.bg,
          borderLeftWidth: 2,
          borderRightWidth: 2,
          borderColor: colors.line,
          overflow: 'hidden',
        }
      : { flex: 1 },
});
