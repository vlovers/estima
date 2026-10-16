import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  hashPassword,
  verifyPassword,
  canUpgradeLegacyPassword,
} from './password-hashing';

describe('Password Unicode boundaries', () => {
  it.each(['\ud800', '\ud801', '\udc00', '\udfff', '\ud800x', '\udc00\ud800'])(
    'rejects malformed UTF-16 before every password primitive, case %#',
    async (suffix) => {
      const candidate = 'password-' + suffix;
      const replacement = candidate.replace(/[\ud800-\udfff]/g, '\ufffd');
      const scryptHash = await hashPassword(replacement);
      const bcryptHash = await bcrypt.hash(replacement, 4);
      await expect(hashPassword(candidate)).rejects.toBeInstanceOf(
        BadRequestException
      );
      await expect(verifyPassword(candidate, scryptHash)).resolves.toBe(false);
      await expect(verifyPassword(candidate, bcryptHash)).resolves.toBe(false);
      expect(canUpgradeLegacyPassword(candidate, bcryptHash)).toBe(false);
      await expect(verifyPassword(replacement, scryptHash)).resolves.toBe(true);
    }
  );

  it('supports multibyte characters and preserves canonical distinctions without normalization', async () => {
    const composed = 'password-🙂-é-\ufffd';
    const decomposed = 'password-🙂-e\u0301-\ufffd';
    const hashed = await hashPassword(composed);
    await expect(verifyPassword(composed, hashed)).resolves.toBe(true);
    await expect(verifyPassword(decomposed, hashed)).resolves.toBe(false);
  });
});
