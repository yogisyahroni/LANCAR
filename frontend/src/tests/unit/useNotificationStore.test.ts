import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotificationStore } from '@/store/useNotificationStore';

describe('useNotificationStore', () => {
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    useNotificationStore.setState({ notifications: [] });
  });

  it('removes routine notifications after the perception window', () => {
    vi.useFakeTimers();

    useNotificationStore.getState().addNotification({
      title: 'Sukses',
      message: 'Pesanan tersimpan',
      type: 'success',
    });

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    vi.advanceTimersByTime(5000);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('keeps persistent critical context until explicit dismissal', () => {
    vi.useFakeTimers();

    useNotificationStore.getState().addNotification({
      title: 'Gangguan layanan',
      message: 'Pengiriman sedang tertunda',
      type: 'error',
      persist: true,
    });

    vi.advanceTimersByTime(30000);
    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.persist).toBe(true);

    useNotificationStore.getState().removeNotification(notification.id);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
