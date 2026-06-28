import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { Injectable } from '@nestjs/common';

@Injectable()
export class StorageService {
  private readonly rootDir = process.env.STORAGE_LOCAL_DIR || path.resolve(process.cwd(), '.runtime-storage');

  async writeTextFile(relativePath: string, content: string) {
    const normalizedPath = relativePath.replace(/^\/+/, '');
    const absolutePath = path.join(this.rootDir, normalizedPath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, content, 'utf8');

    return {
      relativePath: normalizedPath,
      absolutePath,
    };
  }
}
