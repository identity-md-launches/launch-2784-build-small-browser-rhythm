import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const path of ['index.html', 'src', 'assets']) {
  await cp(resolve(root, path), resolve(output, path), { recursive: true });
}
if (!(await stat(resolve(output, 'assets/share.png'))).isFile()) throw new Error('Missing share card');
console.log('Built dist/: HTML, native JavaScript, CSS and local artwork. No runtime dependencies.');
