import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/screens/AppNavigator';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { GlobalAlertProvider, registerCustomAlert } from './src/components/CustomAlert';

function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AppNavigator />
        <GlobalAlertProvider ref={registerCustomAlert} />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

export default App;
