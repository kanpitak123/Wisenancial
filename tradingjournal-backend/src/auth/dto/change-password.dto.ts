import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  /**
   * ไม่ตรวจรูปแบบของรหัสผ่านเดิม — ผู้ใช้รุ่นเก่าอาจตั้งไว้ก่อนมีกฎความยาว/ตัวอักษร
   * ตัวตัดสินคือ bcrypt.compare กับค่าใน DB ไม่ใช่ regex
   */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  current_password!: string;

  // กฎเดียวกับ RegisterDto.password เป๊ะ จะได้ไม่มีรหัสที่สมัครได้แต่เปลี่ยนไปไม่ได้
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'รหัสผ่านต้องมีตัวอักษรและตัวเลขอย่างน้อยอย่างละ 1 ตัว',
  })
  new_password!: string;
}
