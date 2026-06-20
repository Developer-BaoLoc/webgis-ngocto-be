import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  IMPORT_UPLOAD_DIR,
  resolveImportFilePath,
  safeDeleteImportFile,
} from './import-file.util';

describe('import file safety', () => {
  const createdPaths: string[] = [];

  beforeAll(async () => {
    await fs.mkdir(IMPORT_UPLOAD_DIR, { recursive: true });
  });

  afterEach(async () => {
    await Promise.all(
      createdPaths
        .splice(0)
        .map((filePath) => fs.rm(filePath, { force: true, recursive: true })),
    );
  });

  it('deletes a regular file inside uploads/imports', async () => {
    const filePath = path.join(IMPORT_UPLOAD_DIR, `${randomUUID()}.csv`);
    createdPaths.push(filePath);
    await fs.writeFile(filePath, 'temporary import');

    await expect(safeDeleteImportFile(filePath)).resolves.toBe(true);
    await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses path traversal and preserves files outside imports', async () => {
    const outsidePath = path.join(os.tmpdir(), `${randomUUID()}.csv`);
    const logger = { warn: jest.fn() };
    createdPaths.push(outsidePath);
    await fs.writeFile(outsidePath, 'must stay');

    await expect(safeDeleteImportFile(outsidePath, logger)).resolves.toBe(
      false,
    );
    await expect(fs.readFile(outsidePath, 'utf8')).resolves.toBe('must stay');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Không xóa đường dẫn không an toàn'),
    );
    expect(() => resolveImportFilePath('../field-images/icon.png')).toThrow(
      'Từ chối truy cập file ngoài uploads/imports',
    );
  });

  it('refuses a file reached through a symlinked import subdirectory', async () => {
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gis-import-'));
    const outsidePath = path.join(outsideDir, 'outside.csv');
    const linkPath = path.join(IMPORT_UPLOAD_DIR, randomUUID());
    const logger = { warn: jest.fn() };
    createdPaths.push(linkPath, outsideDir);
    await fs.writeFile(outsidePath, 'must also stay');
    await fs.symlink(outsideDir, linkPath, 'dir');

    await expect(
      safeDeleteImportFile(path.join(linkPath, 'outside.csv'), logger),
    ).resolves.toBe(false);
    await expect(fs.readFile(outsidePath, 'utf8')).resolves.toBe(
      'must also stay',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('trỏ ra ngoài uploads/imports'),
    );
  });

  it('silently skips a missing import file', async () => {
    const missingPath = path.join(IMPORT_UPLOAD_DIR, `${randomUUID()}.xlsx`);
    await expect(safeDeleteImportFile(missingPath)).resolves.toBe(false);
  });
});
