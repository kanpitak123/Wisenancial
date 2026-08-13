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
  async getEarningsCalendar(daysAhead = 14): Promise<EarningsCalendar> {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + daysAhead);
    return { from, to, items: [] };
  }
}
