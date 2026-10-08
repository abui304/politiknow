import * as Location from 'expo-location';

/** The device's current position, asking permission first. Used once to look up the user's district;
 *  the app never stores it, and the server discards it after the lookup. */
export async function currentPosition(): Promise<{ latitude: number; longitude: number }> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Location access is off. You can pick your district on the map instead.');
  }
  // High accuracy matters near district lines, which often run down a street.
  const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { latitude: coords.latitude, longitude: coords.longitude };
}
