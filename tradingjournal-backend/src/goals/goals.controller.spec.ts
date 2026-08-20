import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

/**
 * scaffold เดิมไม่ได้ provide GoalsService และไม่ได้ override JwtAuthGuard
 * (Nest พยายามสร้าง guard จริงแล้วลากทั้ง JwtService/ConfigService ตามมา) -> DI พัง
 *
 * ที่สำคัญกว่าการทำให้ไฟล์เขียว: เทสในนี้ล็อกบั๊กสิทธิ์ที่เพิ่งเจอตอนซ่อม
 * คอนโทรลเลอร์เคยอ่าน req.user.sub ซึ่งไม่มีอยู่จริงบน request.user (guard ใส่ userId)
 * -> ส่ง undefined เข้า service -> Prisma มองว่า user_id: undefined = ไม่ต้องกรอง
 * -> ใครก็อ่าน/เขียนเป้าหมายของพอร์ตคนอื่นได้
 */
const goalsServiceMock = {
  getGoal: jest.fn(),
  setGoal: jest.fn(),
};

describe('GoalsController', () => {
  let controller: GoalsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoalsController],
      providers: [{ provide: GoalsService, useValue: goalsServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GoalsController>(GoalsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getGoal ส่ง userId จาก token เข้า service ไม่ใช่ undefined', () => {
    controller.getGoal(5, '2026', '8', { userId: 7 } as never);

    expect(goalsServiceMock.getGoal).toHaveBeenCalledWith(7, 5, 2026, 8);
  });

  it('setGoal ส่ง userId จาก token เข้า service ไม่ใช่ undefined', () => {
    controller.setGoal(
      5,
      { year: 2026, month: 8, target: 5000 },
      { userId: 7 } as never,
    );

    expect(goalsServiceMock.setGoal).toHaveBeenCalledWith(7, 5, 2026, 8, 5000);
  });

  it('userId ที่ส่งต่อต้องไม่เป็น undefined เด็ดขาด', () => {
    // ถ้าหลุดเป็น undefined อีกครั้ง ด่านเช็คสิทธิ์ใน service จะถูกข้ามทั้งหมด
    controller.getGoal(5, '2026', '8', { userId: 7 } as never);

    const [userId] = goalsServiceMock.getGoal.mock.calls[0] as [unknown];

    expect(userId).toBeDefined();
    expect(userId).toBe(7);
  });
});
