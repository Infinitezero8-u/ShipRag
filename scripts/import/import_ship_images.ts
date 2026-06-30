#!/usr/bin/env node
/**
 * Shipsnet image metadata importer.
 * Parses filename pattern: {label}__{YYYYMMDD}_{HHMMSS}_{hex}__{lon}_{lat}.png
 * Creates knowledge_items rows + ship_images table entries.
 *
 * Usage:
 *   npx tsx scripts/import/import_ship_images.ts [--sample 100]
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

const IMG_DIR = '/Volumes/Data/workplace/data/视觉数据/shipsnet/shipsnet';
const API_BASE = process.env.API_BASE || 'http://localhost:5000';

// Filename pattern: 0__20180708_180908_0f47__-118.14880745980487_33.73008948438861.png
const FILENAME_RE = /^(\d)__(\d{8})_(\d{6})_([0-9a-f]+)__(-?\d+\.?\d*)_(-?\d+\.?\d*)/;

function parseFilename(filename: string): { label: string; date: string; time: string; hex: string; lon: string; lat: string } | null {
  const m = filename.match(FILENAME_RE);
  if (!m) return null;
  return { label: m[1], date: m[2], time: m[3], hex: m[4], lon: m[5], lat: m[6] };
}

function formatDate(dateStr: string): string {
  return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}

function formatTime(timeStr: string): string {
  return `${timeStr.substring(0, 2)}:${timeStr.substring(2, 4)}:${timeStr.substring(4, 6)}`;
}

async function importShipImages(sampleSize?: number) {
  const files = fs.readdirSync(IMG_DIR).filter(f => f.endsWith('.png'));
  console.log(`[import] ship_images: ${files.length} PNGs found`);

  const toImport = sampleSize ? files.slice(0, sampleSize) : files;
  const BATCH_SIZE = 200;
  let imported = 0;
  const batch: any[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const resp = await fetch(`${API_BASE}/api/data-center`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import', module: 'ship_image', records: batch, sourceFile: `shipsnet_${Date.now()}` }),
    });
    const result: any = await resp.json();
    if (result.success) {
      imported += batch.length;
      console.log(`  Imported ${imported}/${toImport.length} images`);
    } else {
      console.error(`  Batch failed:`, result.error);
    }
    batch.length = 0;
  };

  for (const filename of toImport) {
    const parsed = parseFilename(filename);
    if (!parsed) {
      console.log(`  Skipping unrecognized: ${filename}`);
      continue;
    }

    const localPath = path.join(IMG_DIR, filename);
    const kiId = uuid();
    const dateStr = `${formatDate(parsed.date)} ${formatTime(parsed.time)}`;
    const title = `Ship image ${dateStr}`;
    const content = `Ship image captured at (${parsed.lat}, ${parsed.lon}) on ${dateStr}. Label: ${parsed.label}, hex: ${parsed.hex}. Local path: ${localPath}`;

    batch.push({
      id: uuid(),
      filename,
      timestamp_str: `${parsed.date}_${parsed.time}`,
      lon: parsed.lon,
      lat: parsed.lat,
      local_path: localPath,
      knowledge_item_id: kiId,
      import_source: 'shipsnet',
      embedding_status: 'pending',
      title,
      content,
      source: 'shipsnet',
    });

    if (batch.length >= BATCH_SIZE) await flushBatch();
  }
  await flushBatch();
  console.log(`[import] ship_images done: ${imported} rows`);
}

const sampleIdx = process.argv.indexOf('--sample');
const sampleSize = sampleIdx >= 0 ? parseInt(process.argv[sampleIdx + 1]) : undefined;
importShipImages(sampleSize).catch(e => { console.error(e); process.exit(1); });
