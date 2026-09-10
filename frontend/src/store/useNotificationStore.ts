import { create } from 'zustand';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  /** Keep critical context visible until the user explicitly dismisses it. */
  persist?: boolean;
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

const createNotificationId = () => {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  webCrypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (n) => {
    const id = createNotificationId();
    set((state) => ({ notifications: [...state.notifications, { ...n, id }] }));
    if (!n.persist) {
      // Auto-remove routine messages after five seconds. Critical context is
      // explicitly dismissed by the user so it cannot disappear mid-task.
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((item) => item.id !== id),
        }));
      }, 5000);
    }
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((item) => item.id !== id),
    })),
}));
