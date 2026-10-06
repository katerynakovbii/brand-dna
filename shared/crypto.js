// Runs unchanged in browsers and Node 24 (WebCrypto + btoa/atob are global in both).
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export const newReportId = () => toB64url(randomBytes(16));
export const generateReportKey = () => toB64url(randomBytes(32));

async function aesKey(raw) {
  return subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function aesEncrypt(raw, obj) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(raw), enc.encode(JSON.stringify(obj)));
  return { iv: toB64url(iv), ct: toB64url(new Uint8Array(ct)) };
}

async function aesDecrypt(raw, iv, ct) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, await aesKey(raw), fromB64url(ct));
  return JSON.parse(dec.decode(pt));
}

export async function encryptReport(obj, keyB64) {
  return JSON.stringify({ v: 1, ...(await aesEncrypt(fromB64url(keyB64), obj)) });
}

export async function decryptReport(text, keyB64) {
  try {
    const { v, iv, ct } = JSON.parse(text);
    if (v !== 1) throw new Error('version');
    return await aesDecrypt(fromB64url(keyB64), iv, ct);
  } catch {
    throw new Error('decrypt failed');
  }
}

