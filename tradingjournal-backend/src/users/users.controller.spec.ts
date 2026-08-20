import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const usersServiceMock = {
  getMe: jest.fn(),
  updateProfile: jest.fn(),
  removeAvatar: jest.fn(),
  getPublicProfile: jest.fn(),
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: usersServiceMock,
        },
      ],
    })
      // @UseGuards(JwtAuthGuard) ระดับคลาสทำให้ Nest พยายามสร้าง JwtAuthGuard จริง
      // ซึ่งดึง dependency ของ auth module ตามมาทั้งสาย เทสนี้สนใจแค่การ routing
      // จึงสวมทับด้วยตัวปลอมที่ปล่อยผ่าน (เดิมพังตรงนี้มาตลอด)
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getPublicProfile ส่งทั้ง username ที่ขอ และ id ของคนที่กำลังดูไปให้ service', () => {
    // id ของผู้ดูคือสิ่งที่ service ใช้ตัดสินว่าเป็นเจ้าของโปรไฟล์หรือไม่
    // ถ้าลืมส่ง เจ้าของจะเปิดโปรไฟล์ตัวเองตอนตั้งเป็นส่วนตัวไม่ได้
    controller.getPublicProfile(
      { userId: 7 } as never,
      'trader01',
    );

    expect(usersServiceMock.getPublicProfile).toHaveBeenCalledWith(
      'trader01',
      7,
    );
  });

  it('getMe ใช้ id จาก token ไม่ใช่ค่าจาก client', () => {
    controller.getMe({ userId: 7 } as never);

    expect(usersServiceMock.getMe).toHaveBeenCalledWith(7);
  });
});
