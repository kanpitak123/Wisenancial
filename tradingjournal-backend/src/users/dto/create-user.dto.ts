import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

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
