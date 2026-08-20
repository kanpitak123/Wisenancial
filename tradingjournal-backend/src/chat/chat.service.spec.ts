import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ChatService } from './chat.service';

/**
 * scaffold เดิมไม่ได้ provide PrismaService ที่ constructor ต้องใช้ -> DI พัง
 *
 * เคสที่ใส่เพิ่มคุมสองอย่างที่พังเงียบได้: ประวัติแชทต้องมีเพดาน (ไม่งั้นห้องที่คุยกัน
 * เป็นปีจะดึงมาทั้งหมด) และข้อมูลผู้ใช้ที่แนบไปกับข้อความต้องไม่มี email/password ติดไป
 */
const prismaMock = {
  chat_messages: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('saveMessage เก็บข้อความผูกกับห้องและผู้ส่งที่ระบุ', async () => {
    prismaMock.chat_messages.create.mockResolvedValue({ id: 1 });

    await service.saveMessage(7, 'general', 'สวัสดี');

    expect(prismaMock.chat_messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { room_name: 'general', user_id: 7, message: 'สวัสดี' },
      }),
    );
  });

  it('ข้อมูลผู้ใช้ที่แนบไปกับข้อความต้องไม่มี email/password', async () => {
    prismaMock.chat_messages.create.mockResolvedValue({ id: 1 });

    await service.saveMessage(7, 'general', 'สวัสดี');

    const args = prismaMock.chat_messages.create.mock.calls[0][0];
    const userSelect = args.include.users.select;

    expect(userSelect).toEqual({ id: true, username: true, full_name: true });
    expect(userSelect).not.toHaveProperty('email');
    expect(userSelect).not.toHaveProperty('password');
  });

  it('getRoomHistory จำกัด 50 ข้อความล่าสุด และเรียงเก่าไปใหม่', async () => {
    // ไม่มีเพดาน = ห้องที่คุยกันมานานจะดึงมาทั้งหมดทีเดียว
    prismaMock.chat_messages.findMany.mockResolvedValue([]);

    await service.getRoomHistory('general');

    expect(prismaMock.chat_messages.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { room_name: 'general' },
        orderBy: { created_at: 'asc' },
        take: 50,
      }),
    );
  });
});
