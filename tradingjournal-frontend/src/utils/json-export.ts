/**
 * ดาวน์โหลดข้อมูลเป็นไฟล์ .json ผ่านเบราว์เซอร์ (ไม่มีการส่งข้อมูลไปที่อื่น)
 *
 * แยกเป็น util ของตัวเองเพราะหน้า Settings ใช้กับไฟล์ export ข้อมูลส่วนตัวของผู้ใช้
 * — สร้าง Blob ในหน่วยความจำแล้วปล่อยทิ้งทันทีหลังคลิก ไม่เขียนลง storage
 */
export function toJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([toJsonText(value)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

/** ชื่อไฟล์ export ที่มีวันที่ (UTC) ต่อท้าย เช่น wisenancial-export-2026-09-26.json */
export function exportFilename(exportedAtIso: string): string {
  return `wisenancial-export-${exportedAtIso.slice(0, 10)}.json`;
}
