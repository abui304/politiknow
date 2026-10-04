import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from './api';

/**
 * Registers this device for push notifications via Expo's free push service.
 * Silently does nothing where push can't work: web, simulators, Expo Go, or before an EAS
 * project ID exists. In-app notifications (the bell tab) work everywhere regardless.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return; // Expo Go
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;

  try {
    let { status } = await Notifications.getPermissionsAsync();
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
