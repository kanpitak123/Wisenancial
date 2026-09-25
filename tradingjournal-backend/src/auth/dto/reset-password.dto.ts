import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  // token ดิบยาว 43 ตัว จำกัดขอบบนกันยิงข้อความยาวมา hash เล่น
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  // กฎเดียวกับ RegisterDto/ChangePasswordDto เป๊ะ
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'รหัสผ่านต้องมีตัวอักษรและตัวเลขอย่างน้อยอย่างละ 1 ตัว',
  })
  new_password!: string;
}
