import { Injectable } from '@nestjs/common';

export interface EarningsCalendarItem {
  symbol: string;
  companyName: string | null;
  earningsDate: Date;
  epsEstimate: number | null;
  epsActual: number | null;
}

export interface EarningsCalendar {
  from: Date;
  to: Date;
  items: EarningsCalendarItem[];
}

@Injectable()
export class EarningsCalendarService {
  // async เพื่อคง Promise<EarningsCalendar> ตาม interface ไว้ — ตอนนี้เป็น stub คืน items
  // ว่างเปล่า ยังไม่มี await จริง (รอเชื่อมต่อแหล่งข้อมูล earnings calendar จริง)
  // eslint-disable-next-line @typescript-eslint/require-await
  async getEarningsCalendar(daysAhead = 14): Promise<EarningsCalendar> {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + daysAhead);
    return { from, to, items: [] };
  }
}
