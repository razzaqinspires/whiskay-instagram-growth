import { chmod, mkdir } from 'node:fs/promises';
import path from 'node:path';

/** Create a private POSIX directory for credentials and private application data. */
export async function ensurePrivateDirectory(directory) {
  const absolute = path.resolve(directory);
  await mkdir(absolute, { recursive: true, mode: 0o700 });
  await chmod(absolute, 0o700);
  return absolute;
}
