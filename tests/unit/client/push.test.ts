// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  askForBrowserNotifications,
  browserNotificationsSupported,
  stopBrowserNotifications,
} from '../../../src/client/push.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

function installPush(permission: NotificationPermission, endpoint = 'https://push.example/abc') {
  const unsubscribe = vi.fn(() => Promise.resolve(true));
  const subscription = { endpoint, unsubscribe };
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(null)),
    subscribe: vi.fn(() => Promise.resolve(subscription)),
  };
  const registration = { pushManager };
  vi.stubGlobal('Notification', { requestPermission: vi.fn(() => Promise.resolve(permission)) });
  vi.stubGlobal('PushManager', function PushManager() {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      register: vi.fn(() => Promise.resolve(registration)),
      getRegistration: vi.fn(() =>
        Promise.resolve({ pushManager: { getSubscription: () => Promise.resolve(subscription) } }),
      ),
    },
  });
  return { pushManager, unsubscribe };
}

describe('browser notifications (UC-REG-15)', () => {
  it('reports unsupported browsers without asking anything', async () => {
    expect(browserNotificationsSupported()).toBe(false);
    expect(await askForBrowserNotifications(true, 'key')).toEqual({
      email: true,
      browser: true,
      browser_permission: 'unsupported',
    });
  });

  it('sends the push endpoint only when the browser says yes', async () => {
    const { pushManager } = installPush('granted');
    expect(browserNotificationsSupported()).toBe(true);
    const result = await askForBrowserNotifications(
      false,
      'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFg',
    );
    expect(result).toEqual({
      email: false,
      browser: true,
      browser_permission: 'granted',
      browser_push_endpoint: 'https://push.example/abc',
    });
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
  });

  it('passes on a no from the browser, so browser comes off the channels', async () => {
    installPush('denied');
    expect(await askForBrowserNotifications(true, 'key')).toEqual({
      email: true,
      browser: true,
      browser_permission: 'denied',
    });
  });

  it('forgets the subscription on this device when turned off', async () => {
    const { unsubscribe } = installPush('granted');
    await stopBrowserNotifications();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
