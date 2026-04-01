/**
 * Pantry modal legacy route — kept only to redirect older links.
 * Pantry management now lives inside the Provisions tab.
 */
import { Redirect } from 'expo-router';

export default function PantryModalRedirect() {
  return <Redirect href="/(tabs)/shopping" />;
}
