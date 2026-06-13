import { IsOptional, IsString } from 'class-validator';

export class UpdateSchemaDraftDto {
  @IsOptional()
  @IsString()
  changeSummary?: string;
}
