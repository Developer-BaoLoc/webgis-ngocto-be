import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ImportService, IMPORT_QUEUE } from './import.service';

@Processor(IMPORT_QUEUE)
export class ImportProcessor extends WorkerHost {
  constructor(private readonly importService: ImportService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === 'execute') {
      return this.importService.processImportJob(job.data as {
        tenantId: string;
        userId: string;
        importId: string;
        jobId: string;
        templateCode: string;
      });
    }
    return null;
  }
}
