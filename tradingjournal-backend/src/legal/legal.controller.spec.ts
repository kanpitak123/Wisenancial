import { GUARDS_METADATA, HEADERS_METADATA } from '@nestjs/common/constants';
import { CURRENT_TERMS_VERSION } from './legal.constants';
import { LegalController } from './legal.controller';

describe('LegalController', () => {
  const controller = new LegalController();

  // อ่านตัวฟังก์ชันจาก prototype โดยตรง (เลี่ยงการอ้าง method ลอย ๆ ที่ eslint ห้าม)
  const handler = Object.getOwnPropertyDescriptor(
    LegalController.prototype,
    'getTermsVersion',
  )?.value as object;

  it('returns the one server-side terms version', () => {
    expect(controller.getTermsVersion()).toEqual({
      terms_version: CURRENT_TERMS_VERSION,
    });
  });

  it('is public: no guard on the class or the handler (signup runs before login)', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LegalController),
    ).toBeUndefined();
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
  });

  it('is never cached, so a stale version cannot be sent at signup', () => {
    const headers = Reflect.getMetadata(HEADERS_METADATA, handler) as {
      name: string;
      value: string;
    }[];

    expect(headers).toContainEqual({
      name: 'Cache-Control',
      value: 'no-store',
    });
  });
});
