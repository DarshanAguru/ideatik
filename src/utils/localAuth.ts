import { NativeModules } from 'react-native';

const { LocalAuthModule } = NativeModules;

export const isDeviceSecure = async (): Promise<boolean> => {
  try {
    if (!LocalAuthModule) return false;
    return await LocalAuthModule.isDeviceSecure();
  } catch (e) {
    console.error('LocalAuth: isDeviceSecure check failed', e);
    return false;
  }
};

export const authenticate = async (
  title: string = 'Ideatik Vault',
  description: string = 'Authenticate to access your workspace'
): Promise<boolean> => {
  try {
    if (!LocalAuthModule) return true; // fallback if native module is not linked/active
    return await LocalAuthModule.authenticate(title, description);
  } catch (e) {
    console.error('LocalAuth: authenticate failed', e);
    return false;
  }
};
