import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const VALID = {
  email: 'new@example.com',
  username: 'new.user',
  full_name: 'New User',
  password: 'Password123',
  accepted_terms_version: 'draft-0.1',
};

const errorsFor = async (input: Record<string, unknown>) =>
  (await validate(plainToInstance(RegisterDto, input))).map((e) => e.property);

describe('RegisterDto', () => {
  it('accepts a complete payload that includes the terms version', async () => {
    await expect(errorsFor(VALID)).resolves.toEqual([]);
  });

  it('requires accepted_terms_version — signing up without ticking the box fails', async () => {
    const { accepted_terms_version: _omit, ...withoutConsent } = VALID;

    await expect(errorsFor(withoutConsent)).resolves.toContain(
      'accepted_terms_version',
    );
  });

  it.each<unknown>(['', null, true, 1, 'x'.repeat(33)])(
    'rejects accepted_terms_version = %p',
    async (value) => {
      await expect(
        errorsFor({ ...VALID, accepted_terms_version: value }),
      ).resolves.toContain('accepted_terms_version');
    },
  );
});
