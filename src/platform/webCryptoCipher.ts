// SPDX-License-Identifier: GPL-3.0-or-later
import type { SecretCipher } from '@/core/data/appState';
import { base64Decode, base64Encode } from '@/core/unlock/bytes';

const DB = 'lares-keys';
const STORE = 'keys';
const KEY_ID = 'secrets-v1';
const IV_BYTES = 12;

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function openDb(): Promise<IDBDatabase> {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  return request(r);
}

let keyPromise: Promise<CryptoKey> | null = null;

/** The device key: non-extractable AES-256-GCM, created once and kept in IndexedDB. */
function deviceKey(): Promise<CryptoKey> {
  keyPromise ??= (async () => {
    const db = await openDb();
    const existing = await request(db.transaction(STORE).objectStore(STORE).get(KEY_ID));
    if (existing instanceof CryptoKey) return existing;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    // add() fails if another context stored a key in the meantime – then use that one.
    try {
      await request(db.transaction(STORE, 'readwrite').objectStore(STORE).add(key, KEY_ID));
      return key;
    } catch {
      return (await request(db.transaction(STORE).objectStore(STORE).get(KEY_ID))) as CryptoKey;
    }
  })();
  return keyPromise;
}

/**
 * Browser counterpart of the Android Keystore cipher: secrets (TOTP secret, channel tokens) are
 * encrypted with a key that can't be exported from the browser (the page can use, never read it).
 * Weaker than hardware-backed storage, but the encrypted values in storage alone are useless.
 * Format: base64(iv ‖ ciphertext).
 */
export class WebCryptoCipher implements SecretCipher {
  async encrypt(plain: Uint8Array): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await deviceKey(), plain as BufferSource));
    const out = new Uint8Array(IV_BYTES + data.length);
    out.set(iv);
    out.set(data, IV_BYTES);
    return base64Encode(out);
  }

  async decrypt(encoded: string): Promise<Uint8Array> {
    const raw = base64Decode(encoded);
    if (raw === null) throw new Error('not an encrypted secret');
    const iv = raw.subarray(0, IV_BYTES);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await deviceKey(), raw.subarray(IV_BYTES) as BufferSource));
  }
}
