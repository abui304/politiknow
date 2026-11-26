import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { api } from './api';
import { markAlertOpened } from './events';

/**
 * Registers this device for push notifications via Expo's free push service.
 * Silently does nothing where push can't work: web, simulators, Expo Go, or before an EAS
 * project ID exists. In-app notifications (the bell tab) work everywhere regardless.
 */
export async function registerForPush({ ask = false }: { ask?: boolean } = {}): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return; // Expo Go
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;

  try {
    let { status } = await Notifications.getPermissionsAsync();
    // The permission prompt only appears when asked for: after someone's first follow, when an alert has
    // an obvious use. On launch, an already-granted permission just refreshes the token.
    if (status !== 'granted' && !ask) return;
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api('/users/me', { method: 'PATCH', body: { push_token: token } });
  } catch {
    // Push is best-effort.
  }
}

/**
 * When someone opens the app from a push, records the open (for the alert open-to-visit rate) and goes to
 * the bill it was about. Does nothing on web.
 */
export function usePushOpens() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { bill_id?: string | null; notification_id?: string };
      if (data.notification_id) markAlertOpened(data.notification_id, 'push');
      if (data.bill_id) router.push({ pathname: '/bill/[id]', params: { id: data.bill_id } });
    });
    return () => sub.remove();
  }, []);
}
