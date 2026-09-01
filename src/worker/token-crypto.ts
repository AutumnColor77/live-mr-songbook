import type { Bindings } from "./types";

const ENC_PREFIX = "enc:v1:";

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = "=".repeat((4 - (value.length % 4)) % 4);
  const b64 = (value + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importAesKey(keyMaterial: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(keyMaterial),
  );
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export function tokenEncryptionKey(env: Bindings): string | null {
  return env.TOKEN_ENCRYPTION_KEY?.trim() || env.PLATFORM_ADMIN_TOKEN?.trim() || null;
}

export async function encryptSecret(
  plaintext: string,
  env: Bindings,
): Promise<string> {
  const keyMaterial = tokenEncryptionKey(env);
  if (!keyMaterial) return plaintext;

  const key = await importAesKey(keyMaterial);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return `${ENC_PREFIX}${bytesToBase64Url(combined)}`;
}

export async function decryptSecret(
  stored: string,
  env: Bindings,
): Promise<string> {
  if (!stored.startsWith(ENC_PREFIX)) {
    return stored;
  }

  const keyMaterial = tokenEncryptionKey(env);
  if (!keyMaterial) {
    throw new Error("Encrypted token but TOKEN_ENCRYPTION_KEY not configured");
  }

  const key = await importAesKey(keyMaterial);
  const combined = base64UrlToBytes(stored.slice(ENC_PREFIX.length));
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plain);
}
