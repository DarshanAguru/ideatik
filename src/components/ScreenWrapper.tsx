import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  TouchableOpacity,
  Animated,
  ViewStyle,
  StyleProp,
  GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, ANIMATION } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';

// ─── ScreenWrapper ───────────────────────────────────────────────────────────
// Uses react-native-safe-area-context's SafeAreaView for correct inset handling
// on all Android form factors: status bars, notches, gesture nav bars, chin bars.

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** If true, also apply padding for the bottom safe area inset (default true). */
  safeBottom?: boolean;
  /** If true, also apply padding for the top safe area inset (default true). */
  safeTop?: boolean;
}

export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  style,
  safeBottom = true,
  safeTop = true,
}) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  // Build edge array for SafeAreaView. We always handle left/right.
  // Top and bottom can be disabled per-screen when a tab bar or stack nav handles it.
  const edges: ('top' | 'bottom' | 'left' | 'right')[] = ['left', 'right'];
  if (safeTop) edges.push('top');
  if (safeBottom) edges.push('bottom');

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.safeArea, { backgroundColor: colors.background }]}
    >
      <StatusBar
        barStyle={themeMode === 'light' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
        translucent={false}
      />
      <View style={[styles.container, { backgroundColor: colors.background }, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
};

// ─── PressableScale ───────────────────────────────────────────────────────────

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: (e: GestureResponderEvent) => void;
  delayLongPress?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  scaleValue?: number;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
  activeOpacity?: number;
}

export const PressableScale: React.FC<PressableScaleProps> = ({
  children,
  onPress,
  onLongPress,
  delayLongPress,
  disabled = false,
  style,
  scaleValue = 0.96,
  hitSlop,
  activeOpacity = 1,
}) => {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(scale, {
      toValue: scaleValue,
      ...ANIMATION.spring.tap,
    }).start();
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      ...ANIMATION.spring.settle,
    }).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      activeOpacity={activeOpacity}
    >
      <Animated.View style={[{ transform: [{ scale }] }, style]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

// ─── Divider ─────────────────────────────────────────────────────────────────

export const Divider: React.FC<{ style?: StyleProp<ViewStyle> }> = ({ style }) => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];
  return (
    <View style={[styles.divider, { backgroundColor: colors.border }, style]} />
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
});
