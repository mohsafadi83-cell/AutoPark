import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/** AES-256-GCM helpers used to encrypt industrial secrets at rest. */
export function encryptSecret(plain: string, hexKey: string): string {
  const key = Buffer.from(hexKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(payload: string, hexKey: string): string {
  const [v, ivB, tagB, dataB] = payload.split(':');
  if (v !== 'v1') throw new Error('Unsupported secret format');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(hexKey, 'hex'), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

export const MASK = '********';

export function normalizePlate(plate: string): string {
  return plate.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function datePart(d = new Date()): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export function iso(d: Date | null | undefined): string | null {
  return d ? new Date(d).toISOString() : null;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
