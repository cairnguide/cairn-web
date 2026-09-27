/**
 * Small Web Crypto helpers: base64url, random values, PKCE, and sealing
 * (authenticated encryption) of cookie payloads.
 *
 * Sealing uses AES-256-GCM with a key derived from SESSION_SECRET by HKDF
 * (SHA-256), one key per purpose, so a transaction cookie can never be
 * replayed as a session cookie. Anything that fails to decrypt is treated
 * as absent.
 */
import { decodeBase64 } from '../shared/env.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  return decodeBase64(value);
}

export function randomToken(byteLength = 32): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** RFC 7636 S256 code challenge for a PKCE code verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export type SealPurpose = 'session' | 'transaction';

const keyCache = new Map<string, Promise<CryptoKey>>();

function deriveKey(secret: string, purpose: SealPurpose): Promise<CryptoKey> {
  const cacheKey = `${purpose}:${secret}`;
  let key = keyCache.get(cacheKey);
  if (!key) {
    key = (async () => {
      const raw = decodeBase64(secret);
      if (!raw || raw.length < 32) throw new Error('SESSION_SECRET is not valid.');
      const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: encoder.encode('cairn-web'),
          info: encoder.encode(`cairn-web ${purpose} v1`),
        },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      );
    })();
    keyCache.set(cacheKey, key);
  }
  return key;
}

/** Encrypts and authenticates a JSON payload. Output is base64url, safe for a cookie value. */
export async function seal(
  payload: unknown,
  secret: string,
  purpose: SealPurpose,
): Promise<string> {
  const key = await deriveKey(secret, purpose);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext),
  );
  const out = new Uint8Array(iv.length + ciphertext.length);
  out.set(iv, 0);
  out.set(ciphertext, iv.length);
  return base64UrlEncode(out);
}

/** Returns the payload, or null if the value was tampered with, sealed for another purpose, or malformed. */
export async function unseal<T>(
  value: string,
  secret: string,
  purpose: SealPurpose,
): Promise<T | null> {
  const bytes = base64UrlDecode(value);
  if (!bytes || bytes.length < 12 + 16) return null;
  try {
    const key = await deriveKey(secret, purpose);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    return null;
  }
}
