import { IsInt, IsNumber, IsString, Max, Min } from 'class-validator';

export class DcaSimulatorDto {
  @IsString()
  symbol!: string;

  @IsNumber()
  @Min(1)
  monthlyAmount!: number;

  @IsInt()
  @Min(1)
  @Max(50)
  durationYears!: number;
}
