/**
 * Pantry tab legacy route — kept only to redirect older links.
 * The merged Provisions experience now lives at /(tabs)/shopping.
 */
import { Redirect } from 'expo-router';

export default function PantryTabRedirect() {
  return <Redirect href="/(tabs)/shopping" />;
}
