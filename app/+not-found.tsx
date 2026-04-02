import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui';
import { Spacing, FontSize, FontFamily } from '@/constants/Spacing';

export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Page Not Found</Text>
      <Button title="Go Home" onPress={() => router.replace('/(tabs)/plan' as any)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.md },
  title: { fontSize: FontSize.xl, fontFamily: FontFamily.serifBold },
});
