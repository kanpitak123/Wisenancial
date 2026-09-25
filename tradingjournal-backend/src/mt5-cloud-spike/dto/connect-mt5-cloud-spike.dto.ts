import { IsIn, IsInt, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class ConnectMt5CloudSpikeDto {
  @IsIn(['EA', 'CLOUD'])
  kind!: 'EA' | 'CLOUD';

  // kind: EA
  @ValidateIf((dto: ConnectMt5CloudSpikeDto) => dto.kind === 'EA')
  @IsInt()
  brokerConnectionId?: number;

  // kind: CLOUD
  @ValidateIf((dto: ConnectMt5CloudSpikeDto) => dto.kind === 'CLOUD')
  @IsString()
  @MinLength(1)
  login?: string;

  @ValidateIf((dto: ConnectMt5CloudSpikeDto) => dto.kind === 'CLOUD')
  @IsString()
  @MinLength(1)
  investorPassword?: string;

  @ValidateIf((dto: ConnectMt5CloudSpikeDto) => dto.kind === 'CLOUD')
  @IsString()
  @MinLength(1)
  server?: string;

  @IsOptional()
  @IsInt()
  sinceDays?: number;
}
