#!/usr/bin/env node
'use strict';

// Captures HTML frames via Playwright and assembles into animated GIFs

const fs = require('fs');
const path = require('path');
const http = require('http');

const FRAME_DIR = path.join(__dirname, '..', 'assets', 'frames');
const OUT_DIR = path.join(__dirname, '..', 'assets');

async function startServer(dir, port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const fp = path.join(dir, req.url.slice(1));
      try {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(fp));
      } catch {
        res.writeHead(404);
        res.end('404');
      }
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function captureFrames(page, frameList) {
  const pngs = [];
  for (const frame of frameList) {
    await page.goto(`http://127.0.0.1:8799/${frame.file}`, { waitUntil: 'load' });
    await page.waitForTimeout(30);
    pngs.push(await page.screenshot({ type: 'png' }));
    process.stdout.write('.');
  }
  console.log(` ${pngs.length} frames`);
  return pngs;
}

function createGif(pngBuffers, outPath, { delay = 80 } = {}) {
  const GIFEncoder = require('gif-encoder-2');
  const { PNG } = require('pngjs');

  const first = PNG.sync.read(pngBuffers[0]);
  const encoder = new GIFEncoder(first.width, first.height, 'neuquant', true);
  encoder.setDelay(delay);
  encoder.setRepeat(0);
  encoder.setQuality(10);

  const outStream = fs.createWriteStream(outPath);
  encoder.createReadStream().pipe(outStream);
  encoder.start();
  for (const buf of pngBuffers) {
    encoder.addFrame(PNG.sync.read(buf).data);
  }
  encoder.finish();
  return new Promise((resolve) => outStream.on('finish', resolve));
}

// Duplicate frames to hold on each for a given count
function holdFrames(pngs, holdCount) {
  const out = [];
  for (const png of pngs) {
    for (let i = 0; i < holdCount; i++) out.push(png);
  }
  return out;
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(FRAME_DIR, 'manifest.json'), 'utf8'));
  const server = await startServer(FRAME_DIR, 8799);

  console.log('Launching browser...');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // 1. Session demo — taller viewport to fit terminal + gauge
  await page.setViewportSize({ width: 620, height: 340 });
  process.stdout.write('Capturing session-demo');
  let sessionPngs = await captureFrames(page, manifest['session-demo']);
  // Hold final frames for dramatic pause before loop
  for (let i = 0; i < 10; i++) sessionPngs.push(sessionPngs[sessionPngs.length - 1]);
  console.log('Encoding session-demo.gif...');
  await createGif(sessionPngs, path.join(OUT_DIR, 'session-demo.gif'), { delay: 80 });

  // 2. Display modes — shorter viewport, hold each mode longer
  await page.setViewportSize({ width: 620, height: 120 });
  process.stdout.write('Capturing display-modes');
  const modePngs = await captureFrames(page, manifest['display-modes']);
  console.log('Encoding display-modes.gif...');
  await createGif(holdFrames(modePngs, 8), path.join(OUT_DIR, 'display-modes.gif'), { delay: 180 });

  // 3. Color schemes — hold each scheme longer
  process.stdout.write('Capturing color-schemes');
  const colorPngs = await captureFrames(page, manifest['color-schemes']);
  console.log('Encoding color-schemes.gif...');
  await createGif(holdFrames(colorPngs, 8), path.join(OUT_DIR, 'color-schemes.gif'), { delay: 180 });

  await browser.close();
  server.close();

  // Clean up old gradient-demo.gif if it exists
  const oldGif = path.join(OUT_DIR, 'gradient-demo.gif');
  if (fs.existsSync(oldGif)) fs.unlinkSync(oldGif);

  // Report
  for (const name of ['session-demo.gif', 'display-modes.gif', 'color-schemes.gif']) {
    const sz = fs.statSync(path.join(OUT_DIR, name)).size;
    console.log(`  ${name}: ${(sz / 1024).toFixed(1)} KB`);
  }
  console.log('Done!');
}

main().catch(console.error);
