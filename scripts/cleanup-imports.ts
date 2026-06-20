import { promises as fs } from 'fs';
import * as path from 'path';
import {
  IMPORT_UPLOAD_DIR,
  safeDeleteImportFile,
} from '../src/import/import-file.util';

const DEFAULT_MAX_AGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

async function cleanupImports() {
  const maxAgeDays = readMaxAgeDays();
  const cutoffTime = Date.now() - maxAgeDays * MS_PER_DAY;

  await fs.mkdir(IMPORT_UPLOAD_DIR, { recursive: true });
  const entries = await fs.readdir(IMPORT_UPLOAD_DIR, { withFileTypes: true });

  let deletedFiles = 0;
  let freedBytes = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const filePath = path.join(IMPORT_UPLOAD_DIR, entry.name);
    try {
      const stat = await fs.lstat(filePath);
      if (stat.mtimeMs >= cutoffTime) continue;

      if (await safeDeleteImportFile(filePath)) {
        deletedFiles += 1;
        freedBytes += stat.size;
      }
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        continue;
      }
      console.warn(
        `[cleanup:imports] Không thể xử lý ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(
    `[cleanup:imports] Đã xóa ${deletedFiles} file cũ hơn ${maxAgeDays} ngày, giải phóng ${formatBytes(freedBytes)} (${freedBytes} bytes).`,
  );
}

function readMaxAgeDays(): number {
  const cliValue = process.argv
    .find((arg) => arg.startsWith('--days='))
    ?.slice('--days='.length);
  const rawValue = cliValue ?? process.env.IMPORT_CLEANUP_MAX_AGE_DAYS;
  const parsed = rawValue ? Number(rawValue) : DEFAULT_MAX_AGE_DAYS;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(
      'Số ngày không hợp lệ. Dùng --days=7 hoặc IMPORT_CLEANUP_MAX_AGE_DAYS=7.',
    );
  }

  return parsed;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

cleanupImports().catch((error) => {
  console.error(
    `[cleanup:imports] Thất bại: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
