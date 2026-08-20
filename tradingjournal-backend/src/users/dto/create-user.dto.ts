import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * ⚠️ DTO นี้ไม่ได้ถูกใช้งานที่ไหนเลย (audit 2026-08-20)
 *
 * เป็นของที่ `nest g resource` สร้างทิ้งไว้ การสมัครสมาชิกจริงใช้ RegisterDto ใน
 * auth/dto/register.dto.ts ซึ่งมี email + password ครบ
 *
 * อันตรายถ้าเอาไปต่อ endpoint จริงโดยไม่แก้: **ไม่มีทั้ง email และ password**
 * จะสร้างผู้ใช้ที่ล็อกอินไม่ได้และชนกับ unique constraint ของ email ทันที
 * ถ้าจะทำ endpoint "แอดมินสร้างผู้ใช้" ให้ยืมโครงจาก RegisterDto แทน
 */
export class CreateUserDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'username ใช้ได้เฉพาะตัวอักษร ตัวเลข _ . และ -',
  })
  username!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  full_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
    },
    {
      message: 'avatar_url ต้องเป็น URL ที่ถูกต้อง',
    },
  )
  @MaxLength(500)
  avatar_url?: string;
}
