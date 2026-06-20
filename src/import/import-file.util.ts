import { promises as fs } from 'fs';
import * as path from 'path';

export const IMPORT_UPLOAD_DIR = path.resolve(
  process.cwd(),
  'uploads',
  'imports',
);

type WarningLogger = {
  warn(message: string): void;
};

export function assertImportFilePath(filePath: string): string {
  const resolvedPath = path.resolve(filePath);
  if (!isPathInside(IMPORT_UPLOAD_DIR, resolvedPath)) {
    throw new Error(
      `Từ chối truy cập file ngoài uploads/imports: ${resolvedPath}`,
    );
  }

  return resolvedPath;
}

export function resolveImportFilePath(importId: string): string {
  return assertImportFilePath(path.resolve(IMPORT_UPLOAD_DIR, importId));
}

export async function safeDeleteImportFile(
  filePath: string,
  logger: WarningLogger = console,
): Promise<boolean> {
  let resolvedPath: string;
  try {
    resolvedPath = assertImportFilePath(filePath);
  } catch (error) {
    logger.warn(
      `[import-cleanup] Không xóa đường dẫn không an toàn: ${filePath}. ${formatError(error)}`,
    );
    return false;
  }

  try {
    const stat = await fs.lstat(resolvedPath);
    if (!stat.isFile()) {
      logger.warn(
        `[import-cleanup] Bỏ qua vì không phải file: ${resolvedPath}`,
      );
      return false;
    }

    const [realImportDir, realFilePath] = await Promise.all([
      fs.realpath(IMPORT_UPLOAD_DIR),
      fs.realpath(resolvedPath),
    ]);
    if (!isPathInside(realImportDir, realFilePath)) {
      logger.warn(
        `[import-cleanup] Không xóa file trỏ ra ngoài uploads/imports: ${resolvedPath}`,
      );
      return false;
    }

    await fs.unlink(resolvedPath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }

    logger.warn(
      `[import-cleanup] Không thể xóa file ${resolvedPath}: ${formatError(error)}`,
    );
    return false;
  }
}

function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
