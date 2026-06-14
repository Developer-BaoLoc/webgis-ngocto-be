import { Repository } from 'typeorm';
import { FieldEntity } from '../../database/entities/metadata.entity';
import { slugifyLayerCode } from './layer-code.util';

export function slugifyFieldCode(label: string): string {
  const slug = slugifyLayerCode(label);
  return slug.slice(0, 64);
}

export async function generateUniqueFieldCode(
  fieldsRepository: Repository<FieldEntity>,
  layerId: string,
  label: string,
): Promise<string> {
  const base = slugifyFieldCode(label);
  let code = base;
  let suffix = 2;

  while (
    await fieldsRepository.findOne({
      where: { layerId, storageKey: code },
    })
  ) {
    const tail = `_${suffix}`;
    code = `${base.slice(0, 128 - tail.length)}${tail}`;
    suffix += 1;
  }

  return code;
}
