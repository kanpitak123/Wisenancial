import { BrokerAdapter } from '../interfaces/broker-adapter.interface';
import {
  BrokerAccountSnapshot,
  BrokerConnectionHealth,
  BrokerConnectionMode,
  BrokerDeal,
  BrokerOrder,
  BrokerPosition,
  BrokerType,
} from '../interfaces/broker-types';

/**
 * Base class ให้ adapter ที่ยัง "structural placeholder" เท่านั้น extend — ทุกเมธอด throw
 * error ข้อความชัดเจนแทนการแกล้งทำงาน กัน adapter ที่ยังไม่ implement จริงถูกเรียกโดยไม่รู้ตัว
 * แล้วพังเงียบๆ (เช่น คืน [] ว่างๆ ซึ่งดูเหมือนบัญชีไม่มีข้อมูลจริง)
 */
export abstract class NotImplementedBrokerAdapter implements BrokerAdapter {
  abstract readonly brokerType: BrokerType;
  abstract readonly connectionMode: BrokerConnectionMode;
  protected abstract readonly notImplementedReason: string;

  connect(): Promise<void> {
    return this.fail('connect');
  }

  disconnect(): Promise<void> {
    return this.fail('disconnect');
  }

  getAccount(): Promise<BrokerAccountSnapshot> {
    return this.fail('getAccount');
  }

  getPositions(): Promise<BrokerPosition[]> {
    return this.fail('getPositions');
  }

  getOrders(): Promise<BrokerOrder[]> {
    return this.fail('getOrders');
  }

  getDeals(): Promise<BrokerDeal[]> {
    return this.fail('getDeals');
  }

  sync(): Promise<void> {
    return this.fail('sync');
  }

  getConnectionStatus(): Promise<BrokerConnectionHealth> {
    return this.fail('getConnectionStatus');
  }

  /**
   * คืน rejected Promise แทนการ throw synchronous — ทุกเมธอดใน interface ประกาศ return
   * type เป็น Promise อยู่แล้ว ผู้เรียกจึงคาดหวัง reject ผ่าน await/.catch() ได้เสมอ ไม่ใช่
   * ต้องคอย try/catch รอบ call แบบ synchronous ด้วย
   */
  private fail(method: string): Promise<never> {
    return Promise.reject(
      new Error(
        `${this.constructor.name}.${method}() is not implemented yet — ${this.notImplementedReason}`,
      ),
    );
  }
}
