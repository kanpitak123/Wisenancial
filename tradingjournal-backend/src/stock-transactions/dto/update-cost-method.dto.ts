import { IsIn } from 'class-validator';
export class UpdateCostMethodDto { @IsIn(['FIFO', 'LIFO', 'AVERAGE']) cost_method!: 'FIFO' | 'LIFO' | 'AVERAGE'; }
