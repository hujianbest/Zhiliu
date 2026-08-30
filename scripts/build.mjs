import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rendererOut = path.join(root, 'dist/renderer');

await mkdir(path.join(root, 'dist/main'), { recursive: true });
await mkdir(path.join(root, 'dist/preload'), { recursive: true });
await mkdir(rendererOut, { recursive: true });

await Promise.all([
  esbuild.build({
    absWorkingDir: root,
    entryPoints: ['src/main/index.ts'],
    outfile: 'dist/main/index.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'keytar', 'onnxruntime-node', 'better-sqlite3', 'pdfjs-dist', 'pdfjs-dist/legacy/build/pdf.mjs'],
    logLevel: 'info',
  }),
  esbuild.build({
    absWorkingDir: root,
    entryPoints: ['src/main/utility-worker.ts'],
    outfile: 'dist/main/utility-worker.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    logLevel: 'info',
  }),
  esbuild.build({
    absWorkingDir: root,
    entryPoints: ['src/preload/index.ts'],
    outfile: 'dist/preload/index.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'keytar', 'onnxruntime-node', 'better-sqlite3', 'pdfjs-dist', 'pdfjs-dist/legacy/build/pdf.mjs'],
    logLevel: 'info',
  }),
  esbuild.build({
    absWorkingDir: root,
    entryPoints: ['src/renderer/main.ts'],
    outfile: 'dist/renderer/main.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    logLevel: 'info',
  }),
  copyFile(path.join(root, 'src/renderer/index.html'), path.join(rendererOut, 'index.html')),
  copyFile(path.join(root, 'src/renderer/styles.css'), path.join(rendererOut, 'styles.css')),
]);
