/**
 * Sovereign recovery sharding – client-side only.
 * BIP-39 mnemonic generation, Shamir 2-of-3 split, and guardian-scoped encryption.
 * For use in browser (e.g. recovery kit setup). Never send raw mnemonic or shards to the server.
 */

import * as bip39 from 'bip39';
import { split, combine } from 'shamir-secret-sharing';

/** Future-proof: 600k+ for SHA-256 (OWASP 2024). Consider Argon2id for new code. */
const PBKDF2_ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_LEN = 256;

/** 12-word BIP-39 mnemonic (128-bit entropy). */
export function generateMnemonic(): string {
  return bip39.generateMnemonic(128);
}

/** Mnemonic phrase to raw entropy bytes (for Shamir). */
export function mnemonicToEntropyBytes(mnemonic: string): Uint8Array {
  const hex = bip39.mnemonicToEntropy(mnemonic);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Raw entropy bytes back to mnemonic. */
export function entropyBytesToMnemonic(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return bip39.entropyToMnemonic(hex);
}

/**
 * Split secret into 3 shards; any 2 can reconstruct.
 * Returns 3 Uint8Array shards (index 0 = local/keychain, 1 & 2 = for guardians).
 */
export async function splitSecret(secret: Uint8Array): Promise<[Uint8Array, Uint8Array, Uint8Array]> {
  const shares = await split(secret, 3, 2);
  if (shares.length !== 3) throw new Error('Expected 3 shards');
  return [shares[0], shares[1], shares[2]];
}

/** Reconstruct secret from any 2 shards. */
export async function combineShards(shards: Uint8Array[]): Promise<Uint8Array> {
  if (shards.length < 2) throw new Error('At least 2 shards required');
  return combine(shards);
}

/**
 * Encrypt a shard for a guardian (identifier = email for now).
 * Uses PBKDF2 + AES-GCM. Returns { encrypted (base64), salt (base64) } for storage.
 * Decrypt with decryptShard(encrypted, salt, guardianEmail).
 */
export async function encryptShardForGuardian(
  shard: Uint8Array,
  guardianIdentifier: string
): Promise<{ encrypted: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(guardianIdentifier, salt, KEY_LEN);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    new Uint8Array(shard)
  );
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return {
    encrypted: uint8ToBase64(combined),
    salt: uint8ToBase64(salt),
  };
}

/**
 * Decrypt a shard (guardian side). Call with the same guardianIdentifier (email) used to encrypt.
 */
export async function decryptShardForGuardian(
  encryptedBase64: string,
  saltBase64: string,
  guardianIdentifier: string
): Promise<Uint8Array> {
  const combined = base64ToUint8(encryptedBase64);
  const salt = base64ToUint8(saltBase64);
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);
  const key = await deriveKey(guardianIdentifier, salt, KEY_LEN);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    ciphertext
  );
  return new Uint8Array(decrypted);
}

async function deriveKey(
  identifier: string,
  salt: Uint8Array,
  length: number
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    'raw',
    enc.encode(identifier),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length },
    false,
    ['encrypt', 'decrypt']
  );
}

function uint8ToBase64(u: Uint8Array): string {
  return btoa(String.fromCharCode(...u));
}

function base64ToUint8(s: string): Uint8Array {
  return new Uint8Array(
    atob(s)
      .split('')
      .map((c) => c.charCodeAt(0))
  );
}

/** Full flow: generate mnemonic, split into 3 shards (2-of-3), encrypt 2 for guardians. */
export async function createRecoveryShards(guardianEmails: [string, string]): Promise<{
  mnemonic: string;
  localShardBase64: string;
  guardianShards: Array<{ guardianEmail: string; encrypted: string; salt: string }>;
}> {
  const mnemonic = generateMnemonic();
  const entropy = mnemonicToEntropyBytes(mnemonic);
  const [shard0, shard1, shard2] = await splitSecret(entropy);
  const localShardBase64 = uint8ToBase64(shard0);
  const g1 = await encryptShardForGuardian(shard1, guardianEmails[0]);
  const g2 = await encryptShardForGuardian(shard2, guardianEmails[1]);
  return {
    mnemonic,
    localShardBase64,
    guardianShards: [
      { guardianEmail: guardianEmails[0], ...g1 },
      { guardianEmail: guardianEmails[1], ...g2 },
    ],
  };
}
