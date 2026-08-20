import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/**
 * scaffold เดิม provide คลาส ChatService ตัวจริง -> Nest ต้องการ PrismaService ต่อ
 * -> DI พังทั้งไฟล์ เปลี่ยนเป็น mock แล้ว override guard
 */
const chatServiceMock = {
  getRoomHistory: jest.fn(),
  saveMessage: jest.fn(),
};

describe('ChatController', () => {
  let controller: ChatController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [{ provide: ChatService, useValue: chatServiceMock }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('ส่งชื่อห้องจาก path ต่อให้ service ตรงตัว', async () => {
    chatServiceMock.getRoomHistory.mockResolvedValue([]);

    await controller.getRoomHistory('general');

    expect(chatServiceMock.getRoomHistory).toHaveBeenCalledWith('general');
  });
});
