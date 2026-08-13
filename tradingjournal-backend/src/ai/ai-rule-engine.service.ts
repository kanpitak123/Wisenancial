import { Injectable } from '@nestjs/common';

@Injectable()
export class AiRuleEngineService {
  analyze(chartType: string, data: unknown): string {
    try {
      if (!data) return '⚠️ ไม่พบข้อมูลดิบในการประมวลผลสถิติ';

      switch (chartType) {
        case 'equity_curve':
          return this.equityCurve(data);
        case 'winrate_position':
          return this.positionWinRate(data);
        case 'winrate_day':
        case 'pnl_day':
          return this.bestWorst(data, 'day', '📅');
        case 'winrate_slot':
        case 'pnl_slot':
          return this.bestWorst(data, 'slot', '⏰');
        case 'monthly_growth':
        case 'winrate_month':
        case 'pnl_month':
          return this.bestWorst(data, 'month', '📊');
        case 'portfolio_allocation':
          return this.allocation(data);
        default:
          return `✅ ระบบประมวลผลข้อมูล ${chartType} สำเร็จ\n📊 ข้อมูลพร้อมสำหรับนำไปวิเคราะห์บนหน้ารายงาน`;
      }
    } catch {
      return '⚠️ เกิดข้อผิดพลาดในการประมวลผล Local Analytics';
    }
  }

  private equityCurve(data: unknown): string {
    const value = data as Record<string, any>;
    const summary = value?.summary ?? value;
    const series = Array.isArray(value?.series?.[0]?.data)
      ? value.series[0].data.map(Number)
      : [];

    const start = Number(
      summary?.start_balance ?? summary?.start ?? series[0] ?? 0,
    );
    const end = Number(
      summary?.end_balance ??
        summary?.end ??
        series[series.length - 1] ??
        0,
    );
    const peak = series.length ? Math.max(...series) : Math.max(start, end);
    const trough = series.length ? Math.min(...series) : Math.min(start, end);
    const drawdown = Number(
      summary?.max_drawdown_estimate ??
        summary?.max_drawdown ??
        peak - trough,
    );
    const net = end - start;
    const percent = start !== 0 ? (net / start) * 100 : 0;

    return [
      `${net >= 0 ? '📈' : '📉'} Equity ${net >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(net).toFixed(2)} (${percent.toFixed(2)}%)`,
      `🛡️ Maximum drawdown โดยประมาณ ${Math.abs(drawdown).toFixed(2)}`,
      `⚖️ ควรควบคุม Risk per Trade ให้อยู่ในกรอบที่กำหนดและประเมินจากจำนวนตัวอย่างร่วมด้วย`,
    ].join('\n');
  }

  private positionWinRate(data: unknown): string {
    const rows = Array.isArray(data) ? data : [];
    const buy = rows.find((row: any) => row.position === 'BUY');
    const sell = rows.find((row: any) => row.position === 'SELL');
    const buyRate = Number(buy?.win_rate ?? 0);
    const sellRate = Number(sell?.win_rate ?? 0);
    const edge =
      buyRate > sellRate + 5
        ? 'BUY'
        : sellRate > buyRate + 5
          ? 'SELL'
          : 'ทั้งสองฝั่งใกล้เคียงกัน';

    return [
      `🎯 BUY win rate ${buyRate.toFixed(1)}% และ SELL win rate ${sellRate.toFixed(1)}%`,
      `⚡ Edge ปัจจุบัน: ${edge}`,
      `💡 ลดขนาดความเสี่ยงในฝั่งที่สถิติอ่อนกว่า จนกว่าจะมีข้อมูลใหม่ยืนยัน`,
    ].join('\n');
  }

  private bestWorst(
    data: unknown,
    key: 'day' | 'slot' | 'month',
    icon: string,
  ): string {
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return `${icon} ยังมีข้อมูลไม่เพียงพอสำหรับวิเคราะห์`;

    const score = (row: any) =>
      Number(
        row.net ??
          row.total_pnl ??
          row.pnl ??
          row.win_rate ??
          0,
      );

    const sorted = [...rows].sort((a, b) => score(b) - score(a));
    const best = sorted[0] as any;
    const worst = sorted[sorted.length - 1] as any;
    const label = (row: any) =>
      row?.[key] ?? row?.label ?? row?.slot ?? row?.day ?? 'N/A';

    return [
      `${icon} ผลงานดีที่สุด: ${label(best)} (${score(best).toFixed(2)})`,
      `⚠️ ผลงานต่ำสุด: ${label(worst)} (${score(worst).toFixed(2)})`,
      `🧠 ใช้ข้อมูลนี้เพื่อลดความถี่หรือความเสี่ยงในช่วงที่ผลงานอ่อนแอ ไม่ควรตัดสินจากสถิติจำนวนน้อย`,
    ].join('\n');
  }

  private allocation(data: unknown): string {
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) return '📊 ยังไม่มีข้อมูล Allocation';

    const sorted = [...rows].sort(
      (a: any, b: any) =>
        Number(b.weight ?? 0) - Number(a.weight ?? 0),
    );
    const top = sorted[0] as any;
    const topWeight = Number(top.weight ?? 0);
    const warning =
      topWeight >= 40
        ? 'มี concentration risk สูง'
        : topWeight >= 25
          ? 'ควรติดตาม concentration risk'
          : 'การกระจายตัวเบื้องต้นอยู่ในระดับสมเหตุผล';

    return [
      `📊 สินทรัพย์น้ำหนักสูงสุดคือ ${top.symbol ?? top.label ?? 'N/A'} ที่ ${topWeight.toFixed(1)}%`,
      `⚠️ ${warning}`,
      `💡 ควรประเมิน Sector, Currency และ Correlation เพิ่มเติมก่อน Rebalance`,
    ].join('\n');
  }
}
