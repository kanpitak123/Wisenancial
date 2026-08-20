import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_.-]+$/, {
    message: 'username ใช้ได้เฉพาะตัวอักษร ตัวเลข _ . และ -',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  full_name?: string;

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

  /**
   * เปิด/ปิดโปรไฟล์สาธารณะ — คอลัมน์ users.is_public_profile มีใน schema อยู่แล้ว
   * (default false) แต่ยังไม่เคยมีทางแก้ผ่าน API เลย
   */
  @IsOptional()
  @IsBoolean()
  is_public_profile?: boolean;
}
