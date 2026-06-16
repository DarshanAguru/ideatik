import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { HomeScreen } from './HomeScreen';
import { NotesScreen } from './NotesScreen';
import { SettingsScreen } from './SettingsScreen';
import { ProfileScreen } from './ProfileScreen';
import { RecordingScreen } from './RecordingScreen';
import { NoteDetailScreen } from './NoteDetailScreen';
import { OnboardingScreen } from './OnboardingScreen';
import { HelpScreen } from './HelpScreen';
import { COLORS, TYPOGRAPHY } from '../theme/theme';
import { useSettingsStore } from '../features/settings/settingsStore';
import { useSecurityStore } from '../features/security/securityStore';
import { Home, FileText, Settings, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BackgroundTaskManager } from '../services/background/BackgroundTaskManager';
import { WhisperService } from '../services/whisper/WhisperService';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const HomeIcon = ({ color }: { color: string }) => <Home size={20} color={color} />;
const NotesIcon = ({ color }: { color: string }) => <FileText size={20} color={color} />;
const SettingsIcon = ({ color }: { color: string }) => <Settings size={20} color={color} />;
const ProfileIcon = ({ color }: { color: string }) => <User size={20} color={color} />;

// Type Definitions for Navigation Parameters
export type RootStackParamList = {
  MainTabs: undefined;
  Recording: undefined;
  NoteDetail: { noteId: string };
  Help: undefined;
};

const TabNavigator = () => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];
  const insets = useSafeAreaInsets();

  // Standard base height (56px) + safe bottom inset with extra buffer for gesture clearance
  const baseTabHeight = 56;
  const tabBarHeight = baseTabHeight + (insets.bottom > 0 ? insets.bottom + 8 : 12);

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.foreground,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: tabBarHeight,
          paddingBottom: insets.bottom > 0 ? insets.bottom + 4 : 12,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: TYPOGRAPHY.sizes.xs,
          fontWeight: TYPOGRAPHY.weights.semibold,
          letterSpacing: TYPOGRAPHY.tracking.caps,
          textTransform: 'uppercase',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home', tabBarIcon: HomeIcon }}
      />
      <Tab.Screen
        name="NotesTab"
        component={NotesScreen}
        options={{ tabBarLabel: 'Notes', tabBarIcon: NotesIcon }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings', tabBarIcon: SettingsIcon }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Profile', tabBarIcon: ProfileIcon }}
      />
    </Tab.Navigator>
  );
};

export const AppNavigator: React.FC = () => {
  const themeMode = useSettingsStore((state) => state.themeMode);
  const colors = COLORS[themeMode];
  const isOnboarded = useSecurityStore((state) => state.isOnboarded);

  useEffect(() => {
    if (!isOnboarded) return;
    BackgroundTaskManager.initialize()
      .then(() => BackgroundTaskManager.startProcessing())
      .catch((e) => console.warn('Background transcription init failed:', e));


    return () => {
      BackgroundTaskManager.stopProcessing();
    };
  }, [isOnboarded]);

  const navTheme = {
    ...(themeMode === 'light' ? DefaultTheme : DarkTheme),
    colors: {
      ...(themeMode === 'light' ? DefaultTheme.colors : DarkTheme.colors),
      background: colors.background,
      card: colors.background,
      text: colors.foreground,
      border: colors.border,
      notification: colors.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isOnboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={TabNavigator} />
            <Stack.Screen
              name="Recording"
              component={RecordingScreen}
              options={{
                presentation: 'modal',
                animation: 'slide_from_bottom',
              }}
            />
            <Stack.Screen
              name="NoteDetail"
              component={NoteDetailScreen}
              options={{
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="Help"
              component={HelpScreen}
              options={{
                animation: 'slide_from_right',
              }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
