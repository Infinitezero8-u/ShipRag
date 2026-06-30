#!/usr/bin/env node
/**
 * Generic CSV → Database importer for Data Center.
 * Stream-reads large CSVs, batches rows to /api/data-center.
 *
 * Usage:
 *   npx tsx scripts/import/import_csv.ts <module> <csvPath> [--sample N]
 *
 * Examples:
 *   npx tsx scripts/import/import_csv.ts bridge /Volumes/Data/workplace/data/基础设施/美国桥梁/fhwa_nbi_2025.csv --sample 5000
 *   npx tsx scripts/import/import_csv.ts safety_incident /Volumes/Data/workplace/data/安全管理/MAIB/occurrences.csv
 *   npx tsx scripts/import/import_csv.ts imdg /Volumes/Data/workplace/data/安全管理/IMDG危险品/datahub.io/data.csv
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { v4 as uuid } from 'uuid';

const API_BASE = process.env.API_BASE || 'http://localhost:5000';

// Module-specific column mappings and knowledge_item text generators
interface ModuleConfig {
  delimiter: string;
  skipLines: number;
  columns: string[];
  /** Generate knowledge_items row text from CSV row */
  toKnowledgeText: (row: Record<string, string>) => { title: string; content: string };
  /** Map CSV columns to DB columns */
  toDbRow: (row: Record<string, string>, kiId: string, sourceFile: string) => Record<string, any>;
}

const MODULE_CONFIGS: Record<string, ModuleConfig> = {
  bridge: {
    delimiter: ',',
    skipLines: 1,
    columns: [],
    toKnowledgeText: (row) => ({
      title: `Bridge ${row.STRUCTURE_NUMBER_008 || '?'} - ${row.STATE_CODE_001 || ''}`,
      content: `Bridge ${row.STRUCTURE_NUMBER_008 || ''}: ${row.FACILITY_CARRIED_007 || ''} carries ${row.FEATURES_DESC_006A || ''} at ${row.LOCATION_009 || ''}. Built ${row.YEAR_BUILT_027 || '?'}, length ${row.STRUCTURE_LEN_MT_049 || '?'}m. State: ${row.STATE_CODE_001}, County: ${row.COUNTY_CODE_003}.`,
    }),
    toDbRow: (row, kiId, src) => ({
      state_code: row.STATE_CODE_001 || '',
      structure_number: row.STRUCTURE_NUMBER_008 || '',
      route_prefix: row.ROUTE_PREFIX_005B || '',
      route_number: row.ROUTE_NUMBER_005D || '',
      facility_carried: row.FACILITY_CARRIED_007 || '',
      location: row.LOCATION_009 || '',
      lat: row.LAT_016 || '',
      lon: row.LONG_017 || '',
      year_built: row.YEAR_BUILT_027 || '',
      year_reconstructed: row.YEAR_RECONSTRUCTED_106 || '',
      structure_length_m: row.STRUCTURE_LEN_MT_049 || '',
      max_span_length_m: row.MAX_SPAN_LEN_MT_048 || '',
      deck_width_m: row.DECK_WIDTH_MT_052 || '',
      raw_fields: row,
      knowledge_item_id: kiId,
      import_source: src,
      embedding_status: 'pending',
    }),
  },

  safety_incident: {
    delimiter: ';',
    skipLines: 1,
    columns: [],
    toKnowledgeText: (row) => ({
      title: `MAIB ${row.Occurrence_Id || '?'}: ${(row.Short_Description || '').substring(0, 80)}`,
      content: `Marine Incident #${row.Occurrence_Id || '?'} - ${row.Occurrence_Severity || '?'} severity. Date: ${row.Local_Date_Main_Event || '?'}. Type: ${row.Main_Event_L1 || ''} / ${row.Main_Event_L2 || ''}. Location: ${row.Occurrence_Location || ''} (${row.Latitude || ''}, ${row.Longitude || ''}). Vessel: ${row.Vessel_Name || 'unknown'}. Description: ${(row.Description || row.Short_Description || '').substring(0, 1500)}`,
    }),
    toDbRow: (row, kiId, src) => ({
      occurrence_id: row.Occurrence_Id || '',
      source: 'maib',
      local_date: row.Local_Date_Main_Event || '',
      severity: row.Occurrence_Severity || '',
      main_event_l1: row.Main_Event_L1 || '',
      main_event_l2: row.Main_Event_L2 || '',
      short_description: row.Short_Description || '',
      description: (row.Description || '').substring(0, 5000),
      lat: row.Latitude || '',
      lon: row.Longitude || '',
      vessel_name: row.Vessel_Name || '',
      vessel_type: row.Vessel_Type || '',
      port_accident: row.Port_Of_Accident_L1 || '',
      coastal_state: row.Coastal_State_Affected || '',
      state_reporting: row.State_Reporting || '',
      raw_fields: row,
      knowledge_item_id: kiId,
      import_source: src,
      embedding_status: 'pending',
    }),
  },

  imdg: {
    delimiter: ',',
    skipLines: 1,
    columns: [],
    toKnowledgeText: (row) => ({
      title: `UN ${row['un class'] || '?'}: ${row['dangerous goods'] || ''}`,
      content: `IMDG Dangerous Goods: UN Class ${row['un class'] || ''} — ${row['dangerous goods'] || ''}. Division: ${row['division'] || ''}. Classification: ${row['classification'] || ''}`,
    }),
    toDbRow: (row, kiId, src) => ({
      un_class: row['un class'] || '',
      goods_name: row['dangerous goods'] || '',
      division: row['division'] || '',
      classification: row['classification'] || '',
      knowledge_item_id: kiId,
      embedding_status: 'pending',
    }),
  },

  freight: {
    delimiter: ',',
    skipLines: 1,
    columns: [],
    toKnowledgeText: (row) => ({
      title: `${row.index_name || 'Freight Index'}: ${row.source || ''}`,
      content: `${row.index_name || 'Freight Index'} from ${row.source || 'unknown'}, collected at ${row.collection_time || ''}. Data: ${JSON.stringify(row.data || row).substring(0, 3000)}`,
    }),
    toDbRow: (row, kiId, src) => ({
      index_name: row.index_name || 'unknown',
      collection_time: row.collection_time || '',
      source: row.source || '',
      data: row.data || row,
      knowledge_item_id: kiId,
      embedding_status: 'pending',
    }),
  },

  ais_synopsis: {
    delimiter: ',',
    skipLines: 1,
    columns: [],
    toKnowledgeText: (row) => ({
      title: `Vessel ${(row.vessel_id || '').substring(0, 12)}`,
      content: `Vessel ${row.vessel_id || '?'} at (${row.lat || ''}, ${row.lon || ''}), heading ${row.heading || '?'}, speed ${row.speed || '?'}kts. Annotations: ${row.annotations || '[]'}. Trail: ${JSON.stringify(row.transport_trail || '[]').substring(0, 500)}`,
    }),
    toDbRow: (row, kiId, src) => ({
      vessel_id_hash: row.vessel_id || '?',
      timestamp_unix_ms: row.t || '',
      lon: row.lon || '',
      lat: row.lat || '',
      heading: row.heading || '',
      speed: row.speed || '',
      annotations: safeJson(row.annotations, []),
      transport_trail: safeJson(row.transport_trail, []),
      source_file: src,
      knowledge_item_id: kiId,
      embedding_status: 'pending',
    }),
  },
};

function safeJson(val: any, defaultVal: any): any {
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return defaultVal; }
}

async function importCSV(module: string, csvPath: string, sampleSize?: number) {
  const config = MODULE_CONFIGS[module];
  if (!config) {
    console.error(`Unknown module: ${module}. Available: ${Object.keys(MODULE_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  const sourceFile = path.basename(csvPath);
  console.log(`[import] ${module} ← ${csvPath}`);

  // Mark import as started
  await fetch(`${API_BASE}/api/data-center`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'import-file', module, sourceFile }),
  });

  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineNo = 0;
  let header: string[] = [];
  const batch: any[] = [];
  let totalImported = 0;
  const BATCH_SIZE = 500;

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const resp = await fetch(`${API_BASE}/api/data-center`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import', module, records: batch, sourceFile }),
    });
    const result: any = await resp.json();
    if (!result.success) {
      console.error(`  Batch failed:`, result.error);
    } else {
      totalImported += batch.length;
      console.log(`  Imported ${totalImported} rows...`);
    }
    batch.length = 0;
  };

  for await (const line of rl) {
    lineNo++;
    if (lineNo <= config.skipLines) {
      if (lineNo === 1) header = parseCSVLine(line, config.delimiter);
      continue;
    }
    if (!line.trim()) continue;

    const values = parseCSVLine(line, config.delimiter);
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = values[i] || ''; });

    const kiId = uuid();
    const { title, content } = config.toKnowledgeText(row);
    const dbRow = config.toDbRow(row, kiId, sourceFile);
    dbRow.id = uuid();
    dbRow.title = title;
    dbRow.content = content;
    dbRow.source = sourceFile;

    batch.push(dbRow);

    if (batch.length >= BATCH_SIZE) await flushBatch();
    if (sampleSize && totalImported >= sampleSize) break;
  }
  await flushBatch();

  console.log(`[import] ${module} done: ${totalImported} rows`);
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delimiter) { result.push(current); current = ''; }
      else current += ch;
    }
  }
  result.push(current);
  return result;
}

// ── Main ──
const args = process.argv.slice(2);
const moduleName = args[0];
const filePath = args[1];
const sampleIdx = args.indexOf('--sample');
const sampleSize = sampleIdx >= 0 ? parseInt(args[sampleIdx + 1]) : undefined;

if (!moduleName || !filePath) {
  console.log('Usage: npx tsx scripts/import/import_csv.ts <module> <csvPath> [--sample N]');
  console.log('Modules:', Object.keys(MODULE_CONFIGS).join(', '));
  process.exit(1);
}

importCSV(moduleName, filePath, sampleSize).catch(e => { console.error(e); process.exit(1); });
