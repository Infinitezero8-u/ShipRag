#!/usr/bin/env node
/**
 * Orchestrator: run all data imports in optimal order.
 *
 * Usage:
 *   npx tsx scripts/import/run_all.ts [--skip bridge] [--skip ais] [--skip images]
 */

import { spawn } from 'child_process';
import * as path from 'path';

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);

interface ImportTask {
  name: string;
  script: string;
  args: string[];
}

async function runImport(task: ImportTask): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n=== [${task.name}] Starting ===`);
    const child = spawn('npx', ['tsx', path.join(SCRIPT_DIR, task.script), ...task.args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`=== [${task.name}] SUCCESS ===`);
        resolve(true);
      } else {
        console.error(`=== [${task.name}] FAILED (code ${code}) ===`);
        resolve(false);
      }
    });
  });
}

async function main() {
  const skipArgs = process.argv.filter(a => a.startsWith('--skip')).map(s => s.replace('--skip ', '').replace('--skip', ''));
  const skip = new Set(skipArgs);

  const tasks: ImportTask[] = [];

  // 1. Small datasets first (fast feedback)
  tasks.push({ name: 'IMDG Dangerous Goods', script: 'import_csv.ts', args: ['imdg', '/Volumes/Data/workplace/data/安全管理/IMDG危险品/datahub.io/data.csv'] });
  tasks.push({ name: 'Freight Indices', script: 'import_freight.ts', args: [] });
  tasks.push({ name: 'MAIB Incidents', script: 'import_csv.ts', args: ['safety_incident', '/Volumes/Data/workplace/data/安全管理/MAIB/occurrences.csv'] });

  // 2. Ship images metadata
  if (!skip.has('images')) {
    tasks.push({ name: 'Ship Images', script: 'import_ship_images.ts', args: [] });
  }

  // 3. Bridge data (624K rows - large)
  if (!skip.has('bridge')) {
    tasks.push({ name: 'Bridge Inventory', script: 'import_csv.ts', args: ['bridge', '/Volumes/Data/workplace/data/基础设施/美国桥梁/fhwa_nbi_2025.csv'] });
  }

  // 4. AIS synopses (sample mode)
  if (!skip.has('ais')) {
    const aisDir = '/Volumes/Data/workplace/data/船舶动态/2017-2019摘要/ais_synopses';
    const { readdirSync, existsSync } = await import('fs');
    if (existsSync(aisDir)) {
      const years = readdirSync(aisDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
      for (const year of years.sort()) {
        const yearDir = path.join(aisDir, year);
        const files = readdirSync(yearDir).filter(f => f.endsWith('.csv'));
        for (const file of files.slice(0, 1)) { // First file per year only
          tasks.push({
            name: `AIS Synopses ${year}/${file}`,
            script: 'import_csv.ts',
            args: ['ais_synopsis', path.join(yearDir, file), '--sample', '50000'],
          });
        }
      }
    }
  }

  console.log(`Total tasks: ${tasks.length}`);
  let ok = 0, fail = 0;

  for (const task of tasks) {
    const success = await runImport(task);
    if (success) ok++; else fail++;
  }

  console.log(`\n=== All imports done: ${ok} OK, ${fail} FAILED ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
