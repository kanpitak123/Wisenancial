import { api } from 'src/boot/axios';
import { LEGAL_TERMS_VERSION_PATH } from 'src/constants/legal.constants';
import type { TermsVersionResponse } from 'src/types/legal.types';

export const legalService = {
  /**
   * เวอร์ชัน Terms + Privacy ปัจจุบันจากหลังบ้าน (แหล่งเดียว — หน้าบ้านไม่เก็บเลขเวอร์ชันเอง)
   * endpoint เป็นสาธารณะ เรียกได้ก่อนล็อกอิน
   */
  async getTermsVersion(): Promise<string> {
    const { data } = await api.get<TermsVersionResponse>(LEGAL_TERMS_VERSION_PATH);

    if (typeof data.terms_version !== 'string' || data.terms_version === '') {
      throw new Error('Invalid terms version response');
    }

    return data.terms_version;
  },
};
