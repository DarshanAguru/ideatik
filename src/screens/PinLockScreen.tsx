import React, { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Heading, Body, Caption } from '../components/Typography';
import { SPACING, COLORS, RADIUS } from '../theme/theme';
import { useSecurityStore } from '../features/security/securityStore';
import { useSettingsStore } from '../features/settings/settingsStore';
import { triggerHaptic } from '../utils/haptics';
import { Lock, ShieldAlert, ChevronLeft } from 'lucide-react-native';
import { authenticate } from '../utils/localAuth';

interface PinLockScreenProps {
  mode?: 'unlock' | 'setup';
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const PinLockScreen: React.FC<PinLockScreenProps> = ({
  mode: _mode = 'unlock',
  onSuccess,
  onCancel,
}) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  const { setLocked } = useSecurityStore();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    // Automatically trigger native lock on mount
    triggerNativeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerNativeAuth = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    setAuthFailed(false);

    const success = await authenticate(
      'Ideatik Vault',
      'Please authenticate to unlock your private notes'
    );

    setIsAuthenticating(false);

    if (success) {
      triggerHaptic('success');
      setLocked(false);
      onSuccess?.();
    } else {
      triggerHaptic('impact');
      setAuthFailed(true);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Cancel button if optional (like changing settings) */}
      {onCancel && (
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} activeOpacity={0.7}>
          <ChevronLeft size={20} color={colors.foreground} />
          <Caption size="sm" style={{ color: colors.foreground, marginLeft: 4 }}>Cancel</Caption>
        </TouchableOpacity>
      )}

      {/* Center lock illustrations and status info */}
      <View style={styles.content}>
        {authFailed ? (
          <ShieldAlert size={48} color={colors.error} style={styles.icon} />
        ) : (
          <Lock size={48} color={colors.foreground} style={styles.icon} />
        )}

        <Heading size="lg" style={[styles.title, { color: colors.foreground }]}>
          {authFailed ? 'Authentication Failed' : 'Vault Locked'}
        </Heading>

        <Body size="sm" style={[styles.subtitle, { color: colors.muted }]}>
          {authFailed
            ? 'Verify credentials using your device screen lock to access your notes'
            : 'Ideatik uses secure on-device hardware lock to guard your data'}
        </Body>

        {isAuthenticating ? (
          <ActivityIndicator size="small" color={colors.foreground} style={styles.loader} />
        ) : (
          <TouchableOpacity
            onPress={triggerNativeAuth}
            style={[styles.unlockButton, { backgroundColor: colors.foreground }]}
            activeOpacity={0.85}
          >
            <Body size="sm" style={{ color: colors.background, fontWeight: '700' }}>
              Unlock Workspace
            </Body>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  cancelBtn: {
    position: 'absolute',
    top: 50,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  icon: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.xxl,
  },
  loader: {
    height: 48,
    justifyContent: 'center',
  },
  unlockButton: {
    width: '100%',
    maxWidth: 220,
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
