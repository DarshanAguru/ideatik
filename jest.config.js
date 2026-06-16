module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest-setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?@?react-native|@react-native-community|@react-navigation|lucide-react-native)/',
  ],
  moduleNameMapper: {
    '^whisper\\.rn$': '<rootDir>/__mocks__/whisper.rn.js',
  },
};
