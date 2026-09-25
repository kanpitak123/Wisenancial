import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadJson, exportFilename, toJsonText } from './json-export';

describe('json-export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exportFilename ใช้วันที่ (UTC) ของเวลา export', () => {
    expect(exportFilename('2026-09-26T03:00:00.000Z')).toBe('wisenancial-export-2026-09-26.json');
  });

  it('toJsonText จัดรูปแบบอ่านง่ายและ round-trip ได้', () => {
    const value = { a: 1, nested: { b: [1, 2] } };

    expect(toJsonText(value)).toContain('\n');
    expect(JSON.parse(toJsonText(value))).toEqual(value);
  });

  it('downloadJson สร้างลิงก์ชั่วคราว คลิก แล้วปล่อย object URL ทิ้ง', () => {
    const create = vi.fn().mockReturnValue('blob:fake');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });

    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    downloadJson('x.json', { a: 1 });

    expect(create).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
