import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ReorderFieldsDto {
  /** Danh sách fieldId theo thứ tự hiển thị (trên → dưới / trái → phải). */
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  fieldIds: string[];
}
