import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import PushNotificationPrompt from '@/components/PushNotificationPrompt';
import React from 'react';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value.toString(); }),
    clear: vi.fn(() => { store = {}; }),
    removeItem: vi.fn((key: string) => { delete store[key]; })
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock Notifications and Service Worker
Object.defineProperty(window, 'Notification', {
  value: {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('granted')
  },
  writable: true
});

// Define navigator.serviceWorker in JSDOM
Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    getRegistration: vi.fn().mockResolvedValue({
      pushManager: {
        subscribe: vi.fn().mockResolvedValue({
          endpoint: 'https://test-endpoint.com',
          keys: { p256dh: 'test_p256dh', auth: 'test_auth' }
        })
      }
    })
  },
  writable: true
});

describe('PushNotificationPrompt Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('shows prompt after 3 seconds if conditions are met', async () => {
    render(<PushNotificationPrompt />);
    
    // Check it's not immediately visible
    expect(screen.queryByText('Aktifkan Notifikasi')).not.toBeInTheDocument();

    // Advance time by 3 seconds
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // It should now be visible
    expect(screen.getByText('Aktifkan Notifikasi')).toBeInTheDocument();
  });

  it('sets local storage item when Nanti button is clicked', async () => {
    render(<PushNotificationPrompt />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText('Aktifkan Notifikasi')).toBeInTheDocument();

    const nantiButton = screen.getByText('Nanti');
    act(() => {
      nantiButton.click();
    });

    expect(localStorageMock.setItem).toHaveBeenCalledWith('tembus_push_prompted', 'true');
  });
});
