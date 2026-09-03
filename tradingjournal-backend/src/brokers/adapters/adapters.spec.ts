import { BrokerType } from '@prisma/client';
import { DimeAdapterService } from './dime/dime-adapter.service';
import { Mt4AdapterService } from './mt4/mt4-adapter.service';
import { Mt5AdapterService } from './mt5/mt5-adapter.service';
import { WebullAdapterService } from './webull/webull-adapter.service';

/**
 * Phase 2 = structural placeholder เท่านั้น (โจทย์ห้าม implement broker communication จริง)
 * เทสต์ชุดนี้ยืนยันแค่ 2 อย่าง: (1) adapter แต่ละตัวประกาศ brokerType/connectionMode ถูกต้อง
 * ตามสถาปัตยกรรมที่ตัดสินใจไว้ (2) เมธอดทุกตัว throw แทนที่จะแกล้งทำงานสำเร็จ (เช่นคืน []
 * ว่างๆ ซึ่งดูเหมือนบัญชีไม่มีข้อมูลจริง — อันตรายกว่าการ throw ชัดๆ)
 */
describe.each([
  { name: 'Mt5AdapterService', Adapter: Mt5AdapterService, brokerType: BrokerType.MT5, mode: 'PUSH' },
  { name: 'Mt4AdapterService', Adapter: Mt4AdapterService, brokerType: BrokerType.MT4, mode: 'PUSH' },
  { name: 'WebullAdapterService', Adapter: WebullAdapterService, brokerType: BrokerType.WEBULL, mode: 'PULL' },
  { name: 'DimeAdapterService', Adapter: DimeAdapterService, brokerType: BrokerType.DIME, mode: 'PULL' },
])('$name', ({ Adapter, brokerType, mode }) => {
  const adapter = new Adapter();

  it(`ประกาศ brokerType = ${brokerType} และ connectionMode = ${mode}`, () => {
    expect(adapter.brokerType).toBe(brokerType);
    expect(adapter.connectionMode).toBe(mode);
  });

  it.each([
    'connect',
    'disconnect',
    'getAccount',
    'getPositions',
    'getOrders',
    'getDeals',
    'sync',
    'getConnectionStatus',
  ] as const)('%s() throw แทนการแกล้งทำงานสำเร็จ', async (method) => {
    await expect((adapter as any)[method]()).rejects.toThrow();
  });
});
