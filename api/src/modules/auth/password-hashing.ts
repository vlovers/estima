import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcrypt';
import { BadRequestException } from '@nestjs/common';
import { isWellFormedPassword } from './password-validation';

// Versioned, fixed parameters: scrypt N=2^15, r=8, p=3, 32-byte output.
const PREFIX = '$estima-scrypt-v1$';
const FORMAT = /^\$estima-scrypt-v1\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const LEGACY = /^\$2[ab]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const derive = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      }
    );
  });

export async function hashPassword(password: string): Promise<string> {
  if (!isWellFormedPassword(password)) {
    throw new BadRequestException('Password must contain well-formed Unicode');
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${PREFIX}${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  if (!isWellFormedPassword(password) || typeof stored !== 'string')
    return false;
  const match = FORMAT.exec(stored);
  if (match) {
    const key = await derive(password, Buffer.from(match[1], 'hex'));
    return timingSafeEqual(key, Buffer.from(match[2], 'hex'));
  }
  return LEGACY.test(stored) && bcrypt.compare(password, stored);
}

export function canUpgradeLegacyPassword(
  password: string,
  stored: string
): boolean {
  // At 72+ bytes the old hash cannot prove the complete original password.
  // Preserve those logins until a user-verified credential reset can replace it.
  return (
    isWellFormedPassword(password) &&
    LEGACY.test(stored) &&
    Buffer.byteLength(password, 'utf8') < 72
  );
}
