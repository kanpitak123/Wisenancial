/**
 * isConfigured() ต้องแปลว่า "คีย์ใช้ได้" ไม่ใช่แค่ "มีตัวอักษรอยู่ในตัวแปร"
 *
 * เคสจริงที่ทำให้ต้องมีไฟล์นี้: ช่อง ANTHROPIC_API_KEY ถูกใส่คีย์ของ Groq ไว้
 * (ขึ้นต้น gsk_) ผลคือ Claude โผล่ในตัวเลือกโมเดลให้ผู้ใช้กด แล้วพังทุกครั้ง
 * โดยไม่มีอะไรบอกสาเหตุ และ fallback chain ก็เสียจังหวะไปกับ provider ที่ไม่มี
 * ทางสำเร็จ
 */
import { Logger } from '@nestjs/common';
import {
  API_KEY_FORMATS,
  matchesApiKeyFormat,
  resolveApiKey,
} from './api-key.util';

/** คีย์ตัวอย่างที่หน้าตาถูกต้องตามแต่ละเจ้า (สมมติทั้งหมด ไม่ใช่ของจริง) */
const VALID = {
  groq: 'gsk_' + 'a'.repeat(52),
  openai: 'sk-proj-' + 'a'.repeat(60),
  anthropic: 'sk-ant-api03-' + 'a'.repeat(95),
  gemini: 'AIza' + 'a'.repeat(35),
};

describe('matchesApiKeyFormat — คีย์ที่ถูกต้องต้องผ่าน', () => {
  it.each(Object.keys(VALID) as (keyof typeof VALID)[])(
    '%s: คีย์รูปแบบถูกต้อง -> ผ่าน',
    (provider) => {
      expect(
        matchesApiKeyFormat(VALID[provider], API_KEY_FORMATS[provider]),
      ).toBe(true);
    },
  );

  it('มีช่องว่างหน้า/หลังจากการก๊อปวาง -> ยังผ่าน', () => {
    expect(matchesApiKeyFormat(`  ${VALID.groq}\n`, API_KEY_FORMATS.groq)).toBe(
      true,
    );
  });
});

describe('คีย์ผิด provider ต้องไม่ผ่าน', () => {
  /** นี่คือบั๊กตัวจริงที่เจอใน .env */
  it('เอาคีย์ Groq ไปใส่ช่อง Anthropic -> ไม่ผ่าน', () => {
    expect(matchesApiKeyFormat(VALID.groq, API_KEY_FORMATS.anthropic)).toBe(
      false,
    );
  });

  /**
   * `sk-ant-` ขึ้นต้นด้วย `sk-` ของ OpenAI ด้วย ถ้าเช็คแค่ prefix ตรง ๆ
   * คีย์ Anthropic ที่วางผิดช่องจะผ่านการตรวจของ OpenAI ไปได้
   */
  it('เอาคีย์ Anthropic ไปใส่ช่อง OpenAI -> ไม่ผ่าน แม้จะขึ้นต้นด้วย sk- เหมือนกัน', () => {
    expect(matchesApiKeyFormat(VALID.anthropic, API_KEY_FORMATS.openai)).toBe(
      false,
    );
  });

  it('เอาคีย์ OpenAI ไปใส่ช่อง Anthropic -> ไม่ผ่าน', () => {
    expect(matchesApiKeyFormat(VALID.openai, API_KEY_FORMATS.anthropic)).toBe(
      false,
    );
  });

  it('เอาคีย์ Gemini ไปใส่ช่อง Groq -> ไม่ผ่าน', () => {
    expect(matchesApiKeyFormat(VALID.gemini, API_KEY_FORMATS.groq)).toBe(false);
  });
});

describe('คีย์ไม่ครบ/ว่าง', () => {
  it('prefix ถูกแต่สั้นเกินไป (ก๊อปมาไม่หมด) -> ไม่ผ่าน', () => {
    expect(matchesApiKeyFormat('gsk_abc', API_KEY_FORMATS.groq)).toBe(false);
  });

  it.each([undefined, null, '', '   '])('ค่าว่าง (%p) -> ไม่ผ่าน', (value) => {
    expect(matchesApiKeyFormat(value, API_KEY_FORMATS.groq)).toBe(false);
  });
});

describe('resolveApiKey', () => {
  function silentLogger() {
    const logger = new Logger('test');
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    return logger;
  }

  it('คีย์ถูกต้อง -> คืนค่าที่ trim แล้ว', () => {
    expect(
      resolveApiKey(
        ` ${VALID.gemini} `,
        API_KEY_FORMATS.gemini,
        silentLogger(),
      ),
    ).toBe(VALID.gemini);
  });

  it('คีย์ผิดรูปแบบ -> คืน undefined เหมือนไม่ได้ตั้ง', () => {
    expect(
      resolveApiKey(VALID.groq, API_KEY_FORMATS.anthropic, silentLogger()),
    ).toBeUndefined();
  });

  /**
   * "ไม่ได้ตั้ง" กับ "ตั้งไว้แต่ผิด" ต้องแยกระดับล็อกกัน — อันหลังคือคนตั้งค่า
   * เชื่อว่าทำถูกแล้ว ถ้าเตือนเบา ๆ ปนกับกรณีไม่ได้ตั้งก็จะไม่มีใครสังเกต
   */
  it('ตั้งไว้แต่ผิดรูปแบบ -> ล็อกเป็น error ไม่ใช่ warn และไม่มีตัวคีย์อยู่ในข้อความ', () => {
    const logger = silentLogger();

    resolveApiKey(VALID.groq, API_KEY_FORMATS.anthropic, logger);

    // vi.fn() mock property access ตรงๆ โดน @typescript-eslint/unbound-method (false positive
    // มาตรฐานของ typescript-eslint กับ mocked object methods — ไม่ได้เรียกแบบ unbound จริง)
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.warn).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.error).toHaveBeenCalledTimes(1);

    const message = (logger.error as jest.Mock).mock.calls[0][0] as string;
    expect(message).toContain('ANTHROPIC_API_KEY');
    expect(message).toContain('sk-ant-');
    expect(message).not.toContain(VALID.groq);
  });

  it('ไม่ได้ตั้งเลย -> ล็อกเป็น warn ธรรมดา', () => {
    const logger = silentLogger();

    resolveApiKey(undefined, API_KEY_FORMATS.openai, logger);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.error).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
