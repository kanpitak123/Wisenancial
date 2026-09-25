import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersExportService } from './users-export.service';
import { UsersService } from './users.service';

const usersServiceMock = {
  getMe: jest.fn(),
  updateProfile: jest.fn(),
  removeAvatar: jest.fn(),
  getPublicProfile: jest.fn(),
};

const usersExportServiceMock = {
  buildExport: jest.fn(),
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
        {
          provide: UsersExportService,
          useValue: usersExportServiceMock,
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
    controller.getPublicProfile({ userId: 7 } as never, 'trader01');

    expect(usersServiceMock.getPublicProfile).toHaveBeenCalledWith(
      'trader01',
      7,
    );
  });

  describe('exportMe', () => {
    const BUNDLE = { exported_at: '2026-09-26T03:00:00.000Z', data: {} };

    it('exports the account of the token, never an id from the client', async () => {
      usersExportServiceMock.buildExport.mockResolvedValue(BUNDLE);
      const response = { setHeader: jest.fn() };

      const result = await controller.exportMe(
        { userId: 7 } as never,
        response as never,
      );

      expect(usersExportServiceMock.buildExport).toHaveBeenCalledWith(7);
      expect(result).toBe(BUNDLE);
    });

    it('marks the response no-store and as a dated attachment', async () => {
      usersExportServiceMock.buildExport.mockResolvedValue(BUNDLE);
      const response = { setHeader: jest.fn() };

      await controller.exportMe({ userId: 7 } as never, response as never);

      expect(response.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store',
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="wisenancial-export-2026-09-26.json"',
      );
    });
  });

  it('getMe ใช้ id จาก token ไม่ใช่ค่าจาก client', () => {
    controller.getMe({ userId: 7 } as never);

    expect(usersServiceMock.getMe).toHaveBeenCalledWith(7);
  });
});
