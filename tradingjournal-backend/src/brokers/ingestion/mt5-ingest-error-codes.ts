import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * Machine-readable error codes recorded onto broker_connections.last_error_code by
 * Mt5SyncService.ingest() — lets the frontend setup wizard show a specific, plain-
 * language reason instead of an indefinite spinner. See docs/mt5-ea-setup.md "Known
 * limitations" for the gap this closes (previously the only place a rejection reason
 * was visible at all was the EA's own on-chart Comment overlay).
 *
 * Deliberately NOT exhaustive of every possible EA-side failure — WebRequest whitelist
 * rejections and invalid/unknown API keys never reach this service at all (see
 * broker_connections model comment in schema.prisma), so they can't be represented here.
 */
export enum Mt5IngestErrorCode {
  /** TOFU account/server mismatch — assertAccountIdentity(). */
  ACCOUNT_MISMATCH = 'ACCOUNT_MISMATCH',
  /** Connection exists and authenticates fine, but isn't bound to a portfolio yet. */
  PORTFOLIO_NOT_BOUND = 'PORTFOLIO_NOT_BOUND',
  /** Catch-all for other rejected requests worth surfacing (bad payload, unsupported
   * protocol version, clock skew, platform mismatch) — mirrors the EA's own generic
   * "CONFIG ERROR" chart state naming so the two stay recognizable as the same thing. */
  CONFIG_ERROR = 'CONFIG_ERROR',
}

// ทั้งสอง exception ยังสืบทอด HTTP exception เดิม (BadRequestException/
// ForbiddenException) ไว้เหมือนก่อนหน้านี้เป๊ะ — status code ที่ EA เห็นไม่เปลี่ยน,
// test เดิมที่ expect `.rejects.toThrow(BadRequestException)` ยังผ่านอยู่ แค่แนบ `code`
// เพิ่มมาให้ catch-all ใน ingest() แยกชนิด error ได้โดยไม่ต้อง parse message string
export class Mt5AccountMismatchException extends BadRequestException {
  readonly code = Mt5IngestErrorCode.ACCOUNT_MISMATCH;
}

export class Mt5PortfolioNotBoundException extends ForbiddenException {
  readonly code = Mt5IngestErrorCode.PORTFOLIO_NOT_BOUND;
}
