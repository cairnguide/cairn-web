/**
 * Browser notifications (UC-REG-15 and Settings, UC-REG-17).
 *
 * The browser is asked for permission only in direct response to the person
 * choosing browser notifications, never on page load. Whatever the browser
 * says is sent to the API: granted with the push endpoint, denied, or
 * unsupported. Denied or unsupported takes browser off the channels.
 */
import type { NotificationChannelsIn } from './api-types.ts';

const WORKER_URL = '/push-sw.js';

interface TrustedTypesLike {
  createPolicy(
    name: string,
    rules: { createScriptURL: (input: string) => string },
  ): { createScriptURL(input: string): unknown };
}

/** True when this browser can show notifications from a service worker. */
export function browserNotificationsSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

/**
 * The page requires Trusted Types. The `cairn-push` policy (allowed by the
 * Content Security Policy) accepts exactly one URL, the notification worker.
 */
function workerUrl(): string {
  const tt = (window as unknown as { trustedTypes?: TrustedTypesLike }).trustedTypes;
  if (!tt) return WORKER_URL;
  const policy = tt.createPolicy('cairn-push', {
    createScriptURL: (input) => {
      if (input !== WORKER_URL) throw new TypeError('Not the notification worker.');
      return input;
    },
  });
  return policy.createScriptURL(WORKER_URL) as string;
}

let registration: Promise<ServiceWorkerRegistration> | null = null;

function register(): Promise<ServiceWorkerRegistration> {
  registration ??= navigator.serviceWorker.register(workerUrl(), { scope: '/' });
  return registration;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Call from the click that chose browser notifications. Returns the channels
 * request to send, with what the browser said.
 */
export async function askForBrowserNotifications(
  email: boolean,
  publicKey: string | null | undefined,
): Promise<NotificationChannelsIn> {
  if (!browserNotificationsSupported() || !publicKey) {
    return { email, browser: true, browser_permission: 'unsupported' };
  }
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch {
    return { email, browser: true, browser_permission: 'unsupported' };
  }
  if (permission !== 'granted') return { email, browser: true, browser_permission: 'denied' };
  try {
    const reg = await register();
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(publicKey),
      }));
    return {
      email,
      browser: true,
      browser_permission: 'granted',
      browser_push_endpoint: subscription.endpoint,
    };
  } catch {
    return { email, browser: true, browser_permission: 'unsupported' };
  }
}

/** Turning browser notifications off: forget the subscription on this device too. */
export async function stopBrowserNotifications(): Promise<void> {
  if (!browserNotificationsSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const subscription = await reg?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Nothing to undo on this device.
  }
}
