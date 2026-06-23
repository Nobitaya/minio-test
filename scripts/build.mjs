import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index === -1 ? fallback : args[index + 1];
};
const outputDirectory = resolve(root, valueAfter('--out', 'dist'));
const target = valueAfter('--target', 'netlify');

if (!['netlify', 'proxy'].includes(target)) {
  throw new Error('Build target must be netlify or proxy.');
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(join(root, 'public'), outputDirectory, { recursive: true });

const indexPath = join(outputDirectory, 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');
await writeFile(indexPath, indexHtml.replace('__MINIO_TEST_PROXY_TARGET__', target === 'proxy' ? 'true' : 'false'), 'utf8');

const vendorDirectory = join(outputDirectory, 'vendor');
await cp(join(root, 'node_modules', 'heic2any', 'dist', 'heic2any.js'), join(vendorDirectory, 'heic2any', 'heic2any.js'));
await cp(join(root, 'node_modules', 'utif2', 'UTIF.js'), join(vendorDirectory, 'utif2', 'UTIF.js'));
await cp(join(root, 'node_modules', 'pako', 'dist', 'pako.min.js'), join(vendorDirectory, 'pako', 'pako.min.js'));

await build({
  entryPoints: [join(root, 'src', 'browser', 'runtime.js')],
  outdir: join(outputDirectory, 'assets'),
  entryNames: 'runtime',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  splitting: true,
  target: ['es2022'],
  logLevel: 'silent'
});
