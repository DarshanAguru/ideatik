import { Vibration } from 'react-native';

export const triggerHaptic = (type: 'selection' | 'success' | 'impact' = 'selection') => {
  try {
    if (type === 'selection') {
      // Light selection tick (12ms)
      Vibration.vibrate(12);
    } else if (type === 'impact') {
      // Stronger impact tick (24ms)
      Vibration.vibrate(24);
    } else if (type === 'success') {
      // Double success pulse pattern: 0ms delay, 15ms vibrate, 40ms wait, 15ms vibrate
      Vibration.vibrate([0, 15, 40, 15]);
    }
  } catch (e) {
    console.warn('Haptic feedback failed:', e);
  }
};
