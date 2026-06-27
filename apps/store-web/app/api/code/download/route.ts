import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ZipFile } from 'yazl';

export const runtime = 'nodejs';

const EXCLUDED_DIRS = new Set([
  '.cache',
  '.codex',
  '.git',
  '.next',
  '.turbo',
  '.vercel',
  'coverage',
  'dist',
  'node_modules',
]);

const EXCLUDED_FILES = new Set(['.DS_Store']);

async function buildZipBuffer(repoRoot: string) {
  const archiveName = sanitizeArchiveName(path.basename(repoRoot));

  return await new Promise<Buffer>((resolve, reject) => {
    const zip = new ZipFile();
    const chunks: Buffer[] = [];

    zip.outputStream.on('data', (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });
    zip.outputStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    zip.outputStream.on('error', reject);

    void addDirectory(zip, repoRoot, repoRoot, archiveName)
      .then(() => zip.end())
      .catch(reject);
  });
}

async function addDirectory(zip: ZipFile, currentPath: string, repoRoot: string, archiveRoot: string) {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }

      await addDirectory(zip, path.join(currentPath, entry.name), repoRoot, archiveRoot);
      continue;
    }

    if (EXCLUDED_FILES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = path.relative(repoRoot, absolutePath).split(path.sep).join('/');
    zip.addFile(absolutePath, `${archiveRoot}/${relativePath}`);
  }
}

async function findRepoRoot(startDir: string) {
  let currentDir = startDir;

  while (true) {
    const [packageJson, appsDir, packagesDir, lockfile] = await Promise.all([
      fs.access(path.join(currentDir, 'package.json')).then(() => true).catch(() => false),
      fs.access(path.join(currentDir, 'apps')).then(() => true).catch(() => false),
      fs.access(path.join(currentDir, 'packages')).then(() => true).catch(() => false),
      fs.access(path.join(currentDir, 'package-lock.json')).then(() => true).catch(() => false),
    ]);

    if (packageJson && appsDir && packagesDir && lockfile) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }
}

function sanitizeArchiveName(name: string) {
  const safeName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return safeName || 'code';
}

export async function GET() {
  const repoRoot = await findRepoRoot(process.cwd());
  const archive = await buildZipBuffer(repoRoot);
  const archiveName = `${sanitizeArchiveName(path.basename(repoRoot))}-code.zip`;
  const archiveBody = new Uint8Array(archive);

  return new Response(archiveBody, {
    headers: {
      'Content-Disposition': `attachment; filename="${archiveName}"`,
      'Content-Type': 'application/zip',
      'Cache-Control': 'no-store',
    },
  });
}
