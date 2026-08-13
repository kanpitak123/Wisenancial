import { BadRequestException, Injectable } from '@nestjs/common';
import { CalculatePnlDto } from './dto/calculate-pnl.dto';
import { TradeSide } from './dto/create-trade.dto';

export interface PnlBreakdown {
  direction: 1 | -1;
  price_difference: number;
  volume: number;
  contract_size: number;
  gross_pnl: number;
  commission_cost: number;
  swap: number;
  net_pnl: number;
  result_status: 'WIN' | 'LOSS' | 'BREAKEVEN';
}

@Injectable()
export class PnlCalculatorService {
  calculate(input: CalculatePnlDto): PnlBreakdown {
    const openPrice = Number(input.open_price);
    const closePrice = Number(input.close_price);
    const volume = Number(input.volume);
    const contractSize = Number(input.contract_size ?? 1);
    const commissionCost = Math.abs(Number(input.commission ?? 0));
    const swap = Number(input.swap ?? 0);

    const values = [
      openPrice,
      closePrice,
      volume,
      contractSize,
      commissionCost,
      swap,
    ];

    if (values.some((value) => !Number.isFinite(value))) {
      throw new BadRequestException('ข้อมูลสำหรับคำนวณ PnL ไม่ถูกต้อง');
    }

    if (volume < 0 || contractSize <= 0) {
      throw new BadRequestException(
        'volume ต้องไม่น้อยกว่า 0 และ contract_size ต้องมากกว่า 0',
      );
    }

    const direction: 1 | -1 =
      input.trade_type === TradeSide.BUY ? 1 : -1;

    const priceDifference = closePrice - openPrice;
    const grossPnl =
      priceDifference * volume * contractSize * direction;
    const netPnl = grossPnl - commissionCost + swap;

    return {
      direction,
      price_difference: this.round(priceDifference),
      volume,
      contract_size: contractSize,
      gross_pnl: this.round(grossPnl),
      commission_cost: this.round(commissionCost),
      swap: this.round(swap),
      net_pnl: this.round(netPnl),
      result_status:
        netPnl > 0 ? 'WIN' : netPnl < 0 ? 'LOSS' : 'BREAKEVEN',
    };
  }

  private round(value: number): number {
    return Number(value.toFixed(8));
  }
}
