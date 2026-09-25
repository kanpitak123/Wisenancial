import { IsBoolean, IsString, MinLength } from 'class-validator';

/**
 * Real (beta) connect payload — CLOUD-only, unlike the dev spike's discriminated-union
 * DTO (EA already has its own real flow via the existing wizard/BrokerConnectionsController).
 */
export class ConnectMt5CloudConnectorDto {
  @IsString()
  @MinLength(1)
  login!: string;

  @IsString()
  @MinLength(1)
  investorPassword!: string;

  @IsString()
  @MinLength(1)
  server!: string;

  /** Must be true — the controller rejects anything else. Server-side enforcement of
   * the (DRAFT, pending legal sign-off) PDPA consent checkbox, not just a UI-only gate
   * that a direct API call could bypass. */
  @IsBoolean()
  consentAccepted!: boolean;
}
