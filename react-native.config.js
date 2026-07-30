/**
 * react-native-sqlite-storage still ships legacy Xcode-project metadata, which
 * React Native 0.86 rejects. Point autolinking at our modern local podspec.
 */
module.exports = {
  dependencies: {
    'react-native-sqlite-storage': {
      platforms: {
        ios: {
          podspecPath: './sqlite-storage.podspec',
        },
      },
    },
  },
};
