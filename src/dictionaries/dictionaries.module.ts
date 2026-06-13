import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DictionaryEntity,
  DictionaryItemEntity,
} from '../database/entities/dictionary.entity';
import { DictionariesController } from './dictionaries.controller';
import { DictionariesService } from './dictionaries.service';

@Module({
  imports: [TypeOrmModule.forFeature([DictionaryEntity, DictionaryItemEntity])],
  controllers: [DictionariesController],
  providers: [DictionariesService],
  exports: [DictionariesService],
})
export class DictionariesModule {}
