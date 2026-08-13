import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

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

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'รหัสผ่านต้องมีตัวอักษรและตัวเลขอย่างน้อยอย่างละ 1 ตัว',
  })
  password!: string;
}
