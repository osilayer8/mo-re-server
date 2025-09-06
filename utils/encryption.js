import crypto from 'crypto';

// Expect a 32-byte key in base64 or hex via ENV
const rawKey = process.env.ENCRYPTION_KEY || '';
let key;
if (rawKey) {
  if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
    key = Buffer.from(rawKey, 'hex');
  } else if (rawKey.length === 44 && /=$/.test(rawKey)) {
    key = Buffer.from(rawKey, 'base64');
  } else {
    key = Buffer.from(rawKey.padEnd(32, '0')).subarray(0, 32);
  }
}

export const isEncryptionAvailable = () => !!key;

export function encryptValue(plain) {
  if (!key || !plain) return { cipher: plain, iv: null, tag: null };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return {
    cipher: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  };
}

export function decryptValue(record) {
  const { cipher, iv, tag } = record;
  if (!key || !iv || !tag) return cipher; // stored plaintext fallback
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(cipher, 'base64')),
      decipher.final()
    ]);
    return plain.toString('utf8');
  } catch (e) {
    return '';
  }
}

export function maskIban(iban) {
  if (!iban) return '';
  const compact = iban.replace(/\s+/g, '');
  if (compact.length <= 6) return compact;
  return compact.slice(0, 4) + '****' + compact.slice(-4);
}
