import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestAccountDeletionDto {
  /** ยืนยันตัวตนด้วยรหัสผ่านทุกครั้ง — การลบบัญชีต้องไม่เกิดจากแค่ session ที่ค้างอยู่ */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
