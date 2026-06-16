import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { View, Modal, TouchableOpacity, StyleSheet, Dimensions, Alert } from 'react-native';
import { Heading, Body } from './Typography';
import { COLORS, SPACING } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';

const { width } = Dimensions.get('window');

interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

let alertRef: any = null;

export const registerCustomAlert = (ref: any) => {
  alertRef = ref;
};

// Monkey-patch React Native's Alert.alert
const nativeAlert = Alert.alert;
Alert.alert = (
  title: string,
  message?: string,
  buttons?: Array<AlertButton>,
  options?: any
) => {
  if (alertRef) {
    alertRef.show(title, message, buttons);
  } else {
    nativeAlert(title, message, buttons, options);
  }
};

export const GlobalAlertProvider = forwardRef((props, ref) => {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState<AlertButton[]>([]);

  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];

  useImperativeHandle(ref, () => ({
    show(t: string, m?: string, b?: AlertButton[]) {
      setTitle(t);
      setMessage(m || '');
      setButtons(b && b.length > 0 ? b : [{ text: 'OK' }]);
      setVisible(true);
    },
    hide() {
      setVisible(false);
    }
  }));

  const handleButtonPress = (btn: AlertButton) => {
    setVisible(false);
    if (btn.onPress) {
      // Execute callback on next tick to avoid modal transitions conflict
      setTimeout(() => {
        btn.onPress?.();
      }, 50);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.dialogCard,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <Heading
            size="md"
            style={{
              color: colors.foreground,
              marginBottom: message ? SPACING.sm : SPACING.lg,
              textAlign: 'center',
            }}
          >
            {title}
          </Heading>
          {message ? (
            <Body
              size="sm"
              style={{
                color: colors.muted,
                marginBottom: SPACING.lg,
                textAlign: 'center',
                lineHeight: 18,
              }}
            >
              {message}
            </Body>
          ) : null}
          <View
            style={[
              styles.buttonContainer,
              buttons.length > 2
                ? { flexDirection: 'column' }
                : { flexDirection: 'row' },
            ]}
          >
            {buttons.map((btn, idx) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';

              let textColor = colors.foreground;
              let bgColor = colors.surface;
              let borderCol = colors.border;

              if (isDestructive) {
                textColor = colors.background;
                bgColor = colors.error;
                borderCol = colors.error;
              } else if (isCancel) {
                textColor = colors.muted;
                bgColor = colors.card;
                borderCol = colors.border;
              } else {
                textColor = colors.background;
                bgColor = colors.foreground;
                borderCol = colors.foreground;
              }

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.button,
                    {
                      backgroundColor: bgColor,
                      borderColor: borderCol,
                      flex: buttons.length > 2 ? undefined : 1,
                      marginHorizontal: buttons.length > 2 ? 0 : 4,
                      marginVertical: buttons.length > 2 ? 4 : 0,
                    },
                  ]}
                  onPress={() => handleButtonPress(btn)}
                  activeOpacity={0.8}
                >
                  <Body
                    size="sm"
                    style={{
                      color: textColor,
                      fontWeight: '700',
                      textAlign: 'center',
                    }}
                  >
                    {btn.text || 'OK'}
                  </Body>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  dialogCard: {
    width: Math.min(width - 48, 320),
    borderRadius: 20,
    borderWidth: 1,
    padding: SPACING.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  buttonContainer: {
    justifyContent: 'space-between',
  },
  button: {
    paddingVertical: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
