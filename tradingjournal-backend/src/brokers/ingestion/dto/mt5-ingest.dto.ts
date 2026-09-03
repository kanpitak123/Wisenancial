import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * DTO ชั้นนี้ทำหน้าที่ validate โครงสร้าง/ชนิดข้อมูลที่ API boundary เท่านั้น (required
 * field, ชนิดตัวเลข, ช่วงค่า, timestamp format) — ไม่ทำ business validation (เช่น
 * "position ticket นี้มีอยู่จริงไหม") ซึ่งเป็นหน้าที่ของ mt5-normalizer.ts/mt5-sync.service.ts
 * ชั้นถัดไป ดู Phase 3 design review §5/§6
 */

export enum Mt5EventType {
  HEARTBEAT = 'HEARTBEAT',
  ACCOUNT_SNAPSHOT = 'ACCOUNT_SNAPSHOT',
  POSITIONS_SNAPSHOT = 'POSITIONS_SNAPSHOT',
  DEALS = 'DEALS',
  RECONCILE = 'RECONCILE',
}

// ต้อง sync กับ SUPPORTED_MT5_PROTOCOL_VERSIONS ใน mt5-sync.service.ts — คงไว้เป็น
// versionable ตั้งแต่ Phase 3 แม้จะมีแค่ v1 ก็ตาม (โจทย์ระบุชัดว่า "Keep the protocol
// versionable")
export const MT5_PROTOCOL_VERSION = 1;

export class Mt5IngestEnvelopeDto {
  @IsInt()
  @Min(1)
  protocolVersion!: number;

  @IsIn(['MT5'])
  platform!: 'MT5';

  @IsNotEmpty()
  accountLogin!: number | string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  accountServer!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  clientId!: string;

  @IsDateString()
  sentAt!: string;

  @IsIn(Object.values(Mt5EventType))
  eventType!: Mt5EventType;

  // ไม่ใส่ @ValidateNested/@Type ตรงนี้โดยตั้งใจ — โครงสร้างจริงขึ้นกับ eventType ซึ่งรู้ได้
  // ตอน runtime เท่านั้น (polymorphic body) จึง validate รอบสองแบบ manual ใน
  // Mt5SyncService ด้วย DTO class ที่ตรงกับ eventType นั้นๆ (Mt5PositionsSnapshotPayloadDto
  // ฯลฯ) — @IsObject() ที่นี่แค่กันกรณี payload ไม่ใช่ object เลย (เช่นเป็น array/string)
  @IsObject()
  payload!: Record<string, unknown>;
}

export class Mt5HeartbeatPayloadDto {
  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  @IsNumber()
  equity?: number;

  @IsOptional()
  @IsNumber()
  margin?: number;

  @IsOptional()
  @IsNumber()
  marginFree?: number;
}

export class Mt5AccountSnapshotPayloadDto {
  @IsNotEmpty()
  accountLogin!: number | string;

  @IsNumber()
  balance!: number;

  @IsNumber()
  equity!: number;

  @IsNumber()
  margin!: number;

  @IsNumber()
  marginFree!: number;

  @IsNumber()
  marginLevel!: number;

  @IsNumber()
  credit!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  currency!: string;

  @IsNumber()
  leverage!: number;
}

export class Mt5PositionDto {
  @IsNotEmpty()
  positionTicket!: number | string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  symbol!: string;

  @IsIn(['LONG', 'SHORT'])
  direction!: 'LONG' | 'SHORT';

  @IsNumber()
  @Min(0)
  volume!: number;

  @IsNumber()
  openPrice!: number;

  @IsOptional()
  @IsNumber()
  currentPrice!: number | null;

  @IsOptional()
  @IsNumber()
  sl!: number | null;

  @IsOptional()
  @IsNumber()
  tp!: number | null;

  @IsNumber()
  swap!: number;

  @IsOptional()
  @IsNumber()
  profit!: number | null;

  @IsDateString()
  openedAt!: string;
}

export class Mt5PositionsSnapshotPayloadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  snapshotId!: string;

  // Phase 3C — ต้องเป็น FULL เท่านั้น (ไม่รองรับ partial/delta snapshot ใน endpoint นี้
  // เพื่อไม่ให้ closing-by-absence ตีความ list ที่ไม่ครบว่า "ทุกไม้ที่เหลือถูกปิดหมด")
  @IsIn(['FULL'])
  snapshotType!: 'FULL';

  // Phase 3 pre-EA hardening review §2 — monotonic per-connection counter the EA must
  // increment on every FULL snapshot it sends (e.g. a simple incrementing counter, or
  // GetTickCount()-derived — anything strictly increasing per connection works). Lets
  // Mt5SyncService reject a stale/out-of-order snapshot instead of letting it regress
  // state a newer snapshot already applied. See broker_connections.last_snapshot_sequence.
  @IsInt()
  @Min(0)
  snapshotSequence!: number;

  @IsInt()
  @Min(0)
  positionCount!: number;

  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => Mt5PositionDto)
  positions!: Mt5PositionDto[];
}

export class Mt5DealDto {
  @IsNotEmpty()
  dealTicket!: number | string;

  @IsOptional()
  orderTicket!: number | string | null;

  @IsNotEmpty()
  positionTicket!: number | string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  symbol!: string;

  @IsIn(['IN', 'OUT', 'INOUT', 'OUT_BY'])
  entryType!: 'IN' | 'OUT' | 'INOUT' | 'OUT_BY';

  @IsNumber()
  @Min(0)
  volume!: number;

  @IsNumber()
  price!: number;

  @IsNumber()
  commission!: number;

  @IsNumber()
  swap!: number;

  @IsNumber()
  profit!: number;

  @IsDateString()
  executedAt!: string;
}

export class Mt5DealsPayloadDto {
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => Mt5DealDto)
  deals!: Mt5DealDto[];
}

export class Mt5ReconcilePayloadDto {
  @ValidateNested()
  @Type(() => Mt5AccountSnapshotPayloadDto)
  accountSnapshot!: Mt5AccountSnapshotPayloadDto;

  @ValidateNested()
  @Type(() => Mt5PositionsSnapshotPayloadDto)
  positionsSnapshot!: Mt5PositionsSnapshotPayloadDto;

  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => Mt5DealDto)
  deals!: Mt5DealDto[];
}
