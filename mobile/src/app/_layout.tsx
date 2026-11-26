import {
  Merriweather_400Regular,
  Merriweather_500Medium,
  Merriweather_600SemiBold,
  useFonts,
} from '@expo-google-fonts/merriweather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import * as Linking from 'expo-linking';
import { type Href, router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CommandMenu, useCommandMenu } from '@/components/CommandMenu';
import { Sidebar } from '@/components/Sidebar';
import { Toaster } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useWide } from '@/lib/layout';
import { useAuth } from '@/lib/auth';
import { billPathFrom, usePendingLink } from '@/lib/share';
import { APP_MAX_WIDTH, colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000, // keep data around long enough to be worth saving between launches
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

/**
 * Stale-while-revalidate across launches: the last feed, bills and profile are saved on the device, so the
 * app opens straight onto them and refreshes in the background instead of showing loaders.
 */
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'pk.cache',
  throttleTime: 2000,
});
const PERSISTED = new Set(['me', 'feed', 'bill', 'tags', 'notifications', 'following', 'representatives', 'legislator', 'calendar']);

/**
 * A shared bill link (politiknow.app/bill/…) opens that bill. If the visitor isn't signed in, it's kept while
 * they sign in or sign up, then opened instead of the feed.
 */
function useSharedLinks(ready: boolean, signedIn: boolean) {
  const url = Linking.useLinkingURL();
  const { path, set } = usePendingLink();
  useEffect(() => {
    const bill = billPathFrom(url);
    if (bill && !signedIn) set(bill);
  }, [url, signedIn, set]);
  useEffect(() => {
    if (ready && signedIn && path) {
      set(null);
      router.push(path as Href);
    }
  }, [ready, signedIn, path, set]);
}

/** Keyboard shortcuts on web: ⌘K / Ctrl+K opens the command menu, / jumps to search. */
function useShortcuts(enabled: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const menu = useCommandMenu.getState();
        menu.set(!menu.open);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        router.navigate({
          pathname: '/search',
          params: { focus: String(Date.now()) },
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Merriweather_400Regular,
    Merriweather_500Medium,
    Merriweather_600SemiBold,
  });
  const { hydrated, hydrate, accessToken, stage } = useAuth();

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!accessToken) {
      queryClient.clear();
      persister.removeClient();
    }
  }, [accessToken]);

  const ready = fontsLoaded && hydrated;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  const wide = useWide();
  useShortcuts(ready && Boolean(accessToken) && stage === 'ready');
  useSharedLinks(ready, Boolean(accessToken) && stage === 'ready');
  if (!ready) return null;

  const signedIn = Boolean(accessToken);
  const inApp = signedIn && stage === 'ready';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 24 * 60 * 60_000,
          buster: 'v3', // bump when a cached shape changes, so old saves are thrown away
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED.has(String(q.queryKey[0])),
          },
        }}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <View style={[styles.outer, wide && styles.outerWide]}>
            {wide && inApp ? <Sidebar /> : null}
            <View style={wide ? styles.appWide : styles.app}>
              {/* Native stack transitions: pages slide in from the side and follow the back swipe (and Android's
                predictive back) with the finger. Bill cards zoom into their page on iOS 18 (see BillCard). */}
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
                animation: 'default',
                gestureEnabled: true,
                fullScreenGestureEnabled: true,
              }}>
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
              {/* Open to everyone. Listed last: signed-out visitors land on the first screen they're allowed. */}
              <Stack.Screen name="about" />
            </Stack>
            <Toaster />
            {signedIn && stage === 'ready' ? <CommandMenu /> : null}
          </View>
        </View>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? colors.surfaceAlt : colors.bg,
  },
  // Desktop: navigation down the left, the page filling the rest, all on the same paper.
  outerWide: { flexDirection: 'row', backgroundColor: colors.bg },
  appWide: { flex: 1, minWidth: 0 },
  // On a narrow browser window (a tablet, a half-width window), a centered phone-width column.
  app:
    Platform.OS === 'web'
      ? {
          flex: 1,
          width: '100%',
          maxWidth: APP_MAX_WIDTH,
          alignSelf: 'center',
          backgroundColor: colors.bg,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.line,
          overflow: 'hidden',
        }
      : { flex: 1 },
});
