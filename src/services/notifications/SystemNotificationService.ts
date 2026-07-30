import { NativeModules, Platform } from 'react-native';

type NotificationPayload = {
  title: string;
  body: string;
  noteId?: string;
};

/**
 * Single cross-platform boundary for background completion notifications.
 * Native implementations are deliberately isolated so feature code never
 * assumes Android APIs or blocks the UI thread.
 */
class SystemNotificationServiceClass {
  async requestPermission(): Promise<void> {
    await NativeModules.SystemNotification?.requestPermission?.();
  }

  async notify(payload: NotificationPayload): Promise<void> {
    const module = NativeModules.SystemNotification;
    if (!module?.notify) {
      // A platform can omit notifications (for example, before permission is
      // granted) without affecting the offline capture workflow.
      console.info(`[notification:${Platform.OS}] ${payload.title}: ${payload.body}`);
      return;
    }
    await module.notify(payload.title, payload.body, payload.noteId || '');
  }
}

export const SystemNotificationService = new SystemNotificationServiceClass();
