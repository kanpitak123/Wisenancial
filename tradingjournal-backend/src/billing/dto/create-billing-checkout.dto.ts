import {
  IsIn,
  IsNotEmpty,
  IsString,
} from 'class-validator';

export class CreateBillingCheckoutDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['STARTER', 'PRO', 'MAX'])
  packageId!: string;
}
