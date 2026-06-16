import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme/theme';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const colors = COLORS.dark; // Default to dark for error screen
      
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: colors.background,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: SPACING.lg,
          }}
        >
          <Text
            style={{
              fontSize: TYPOGRAPHY.sizes.xl,
              fontWeight: TYPOGRAPHY.weights.bold,
              color: colors.foreground,
              marginBottom: SPACING.md,
              textAlign: 'center',
            }}
          >
            Oops! Something went wrong
          </Text>
          
          <Text
            style={{
              fontSize: TYPOGRAPHY.sizes.sm,
              color: colors.muted,
              marginBottom: SPACING.lg,
              textAlign: 'center',
              lineHeight: 20,
            }}
          >
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>

          <TouchableOpacity
            onPress={this.handleReset}
            style={{
              backgroundColor: colors.foreground,
              paddingVertical: SPACING.md,
              paddingHorizontal: SPACING.lg,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: colors.background,
                fontWeight: TYPOGRAPHY.weights.bold,
                fontSize: TYPOGRAPHY.sizes.sm,
              }}
            >
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}
