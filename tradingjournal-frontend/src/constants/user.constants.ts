export const USERS_API_PATH = '/users';

export const USER_MESSAGES = {
  loadFailed: 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้',
  updateFailed: 'ไม่สามารถอัปเดตโปรไฟล์ได้',
  removeAvatarFailed: 'ไม่สามารถลบรูปโปรไฟล์ได้',
  changePasswordFailed: 'ไม่สามารถเปลี่ยนรหัสผ่านได้',
  exportFailed: 'ไม่สามารถส่งออกข้อมูลได้',
  deletionFailed: 'ไม่สามารถลบบัญชีได้',
} as const;

/** กฎเดียวกับ RegisterDto.password ฝั่งหลังบ้าน — ตรวจล่วงหน้าเพื่อไม่ต้องรอ 400 */
export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/,
} as const;
