import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Button, Input } from '@/components/ui';

export default function LoginScreen() {
  const colors = useThemeColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Login Error', error.message);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.logo, { color: colors.tint }]}>MealMate</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Smart meal planning & shopping lists
          </Text>
        </View>

        <View style={styles.form}>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            textContentType="password"
          />
          <Button title="Log In" onPress={handleLogin} loading={loading} />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Don't have an account?{' '}
          </Text>
          <Link href="/(auth)/signup">
            <Text style={[styles.link, { color: colors.tint }]}>Sign Up</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  logo: {
    fontSize: FontSize.xxxl,
    fontFamily: FontFamily.serifBold,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: FontSize.md,
    marginTop: Spacing.sm,
  },
  form: {
    gap: Spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  footerText: {
    fontSize: FontSize.sm,
  },
  link: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
});
