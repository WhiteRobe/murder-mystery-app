#!/usr/bin/env node
/* %PROJECT_TITLE% · PDF → PNG splitter
 * 兼容 pdfjs-dist v3.x 与 v4+（自动探测）
 *   node pdf-to-png.cjs --in <dir> --out <dir> [--scale 2.0] [--password <pw>]
 *
 *   Splits every *.pdf under <dir> into per-page PNG files:
 *     <out>/<baseName>/p1.png p2.png ...
 *
 *   Zero system dependencies, but requires pdfjs-dist + canvas:
 *     npm i --prefix ./tools pdfjs-dist@^3.11.174 canvas
 *
 *   重要：必须用 **v3.11.x**。v4+ 在 Node 下有 image drawImageAtIntegerCoords
 *         兼容性 bug（与 node-canvas 配合时）。
 */
'use strict';

const fs   = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return out;
}

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && ent.name.toLowerCase().endsWith('.pdf')) out.push(p);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out) {
    console.error('Usage: node pdf-to-png.cjs --in <dir|file> --out <dir> [--scale 2.0] [--password <pw>]');
    process.exit(1);
  }
  const inPath = path.resolve(args.in);
  const outDir = path.resolve(args.out);
  const scale  = parseFloat(args.scale) || 2.0;
  const password = args.password || undefined;

  if (!fs.existsSync(inPath)) {
    console.error('[ERROR] Input not found:', inPath);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  /* --in 可以是单文件或目录；单文件模式按 basename 输出到 out/ */
  let inputs = [];
  if (fs.statSync(inPath).isFile()) {
    if (!inPath.toLowerCase().endsWith('.pdf')) {
      console.error('[ERROR] --in 文件必须是 .pdf:', inPath);
      process.exit(1);
    }
    inputs = [inPath];
  } else {
    inputs = walk(inPath);
  }

  /* 强制使用 v3.x legacy build（CJS）。v4+ 在 Node + node-canvas 下有 bug。 */
  let pdfjsLib;
  try {
    pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  } catch (e) {
    console.error('[ERROR] Cannot load pdfjs-dist v3.x legacy/build/pdf.js.');
    console.error('         Run: npm i --prefix ./tools pdfjs-dist@^3.11.174 canvas');
    process.exit(1);
  }
  const { createCanvas } = require('canvas');

  /* NodeCanvasFactory for pdfjs-dist */
  class NodeCanvasFactory {
    create(w, h) {
      const canvas = createCanvas(w, h);
      return { canvas, context: canvas.getContext('2d') };
    }
    reset(canvasAndContext, w, h) {
      canvasAndContext.canvas.width = w;
      canvasAndContext.canvas.height = h;
    }
    destroy(canvasAndContext) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  }

  const pdfs = inputs;
  console.log(`Found ${pdfs.length} PDF(s) under ${inPath}${fs.statSync(inPath).isFile() ? ' (single file)' : ''}`);

  let ok = 0, skip = 0, fail = 0;
  for (const pdfPath of pdfs) {
    const baseName = path.basename(pdfPath, '.pdf');
    const targetDir = path.join(outDir, baseName);
    fs.mkdirSync(targetDir, { recursive: true });

    let pdfDoc;
    try {
      const data = new Uint8Array(fs.readFileSync(pdfPath));
      pdfDoc = await pdfjsLib.getDocument({
        data,
        password,
        isEvalSupported: false,
        disableFontFace: true,
        useSystemFonts: false,
      }).promise;
    } catch (e) {
      if (e && (e.name === 'PasswordException' || /password/i.test(e.message))) {
        console.warn(`[SKIP] ${pdfPath}: password required`);
        skip++;
        continue;
      }
      console.warn(`[FAIL] ${pdfPath}:`, e.message || e);
      fail++;
      continue;
    }

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale });
        const factory = new NodeCanvasFactory();
        const cc = factory.create(viewport.width, viewport.height);
        const renderTask = page.render({
          canvasContext: cc.context,
          viewport,
          canvasFactory: factory,
        });
        await renderTask.promise;
        const buf = cc.canvas.toBuffer('image/png');
        const outFile = path.join(targetDir, `p${i}.png`);
        fs.writeFileSync(outFile, buf);
        console.log(`  ${baseName}/p${i}.png (${buf.length} bytes)`);
      } catch (e) {
        console.warn(`[WARN] ${pdfPath} page ${i}:`, e.message || e);
      }
    }
    ok++;
  }

  console.log(`Done: ${ok} OK, ${skip} skipped, ${fail} failed.`);
  console.log(`Output: ${outDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });