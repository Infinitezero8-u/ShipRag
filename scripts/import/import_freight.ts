#!/usr/bin/env node
/**
 * Freight indices JSON → Database importer.
 *
 * Usage:
 *   npx tsx scripts/import/import_freight.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

const FREIGHT_DIR = '/Volumes/Data/workplace/data/航运经济/运价指数';
const API_BASE = process.env.API_BASE || 'http://localhost:5000';

interface FreightRecord {
  index_name: string;
  collection_time: string;
  source: string;
  data: any;
  title: string;
  content: string;
}

function extractRecords(jsonPath: string): FreightRecord[] {
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const records: FreightRecord[] = [];
  const basename = path.basename(jsonPath, '.json');

  const getName = (): string => {
    const map: Record<string, string> = {
      drewry_world_container_index_wci: 'Drewry WCI',
      freightos_baltic_index_fbx: 'Freightos FBX',
      scfi_shanghai_container_freight_index: 'SCFI',
      harpex_charter_rate_index: 'HARPEX',
      shippingrates_freight_rates: 'ShippingRates Freight',
      shippingrates_carriers: 'ShippingRates Carriers',
      shippingrates_ports: 'ShippingRates Ports',
      shippingrates_port_congestion: 'ShippingRates Congestion',
    };
    return map[basename] || basename;
  };

  const indexName = getName();
  const collectionTime = raw.collection_time || raw.timestamp || '';
  const source = raw.source || raw.title || '';

  // Generate records from routes/data entries
  if (raw.routes && Array.isArray(raw.routes)) {
    for (const route of raw.routes) {
      records.push({
        index_name: indexName,
        collection_time: collectionTime,
        source: `${source} - ${route.origin || route.from || ''} → ${route.destination || route.to || ''}`,
        data: route,
        title: `${indexName}: ${route.origin || route.from || ''} → ${route.destination || route.to || ''}`,
        content: `${indexName} rate for ${route.origin || route.from || ''} → ${route.destination || route.to || ''}: ${route.rate || route.price || JSON.stringify(route)}. Collected: ${collectionTime}. Source: ${source}`,
      });
    }
  } else if (raw.data && typeof raw.data === 'object') {
    // Single record with nested data
    const dataStr = JSON.stringify(raw.data).substring(0, 3000);
    records.push({
      index_name: indexName,
      collection_time: collectionTime,
      source,
      data: raw.data,
      title: `${indexName} Index Data`,
      content: `${indexName} from ${source}. Collected at ${collectionTime}. Data: ${dataStr}`,
    });
  } else {
    // Entire file is one record
    records.push({
      index_name: indexName,
      collection_time: collectionTime,
      source,
      data: raw,
      title: `${indexName} Index`,
      content: `${indexName} from ${source}. Collected at ${collectionTime}. Description: ${raw.description || ''}. Data: ${JSON.stringify(raw).substring(0, 3000)}`,
    });
  }

  return records;
}

async function importFreight() {
  const files = fs.readdirSync(FREIGHT_DIR).filter(f => f.endsWith('.json'));
  console.log(`[import] freight: ${files.length} JSON files`);

  // Also process CSVs
  const csvFiles = fs.readdirSync(FREIGHT_DIR).filter(f => f.endsWith('.csv'));
  console.log(`[import] freight CSVs: ${csvFiles.length} files`);

  let totalRecords = 0;
  const BATCH_SIZE = 200;
  const batch: any[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const resp = await fetch(`${API_BASE}/api/data-center`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'import', module: 'freight', records: batch, sourceFile: 'freight_indices' }),
    });
    const result: any = await resp.json();
    if (result.success) {
      totalRecords += batch.length;
      console.log(`  Imported ${totalRecords} freight records`);
    } else {
      console.error(`  Batch failed:`, result.error);
    }
    batch.length = 0;
  };

  // Process JSON files
  for (const file of files) {
    try {
      const records = extractRecords(path.join(FREIGHT_DIR, file));
      for (const r of records) {
        const kiId = uuid();
        batch.push({
          id: uuid(),
          index_name: r.index_name,
          collection_time: r.collection_time,
          source: r.source,
          data: r.data,
          knowledge_item_id: kiId,
          embedding_status: 'pending',
          title: r.title,
          content: r.content,
        });
        if (batch.length >= BATCH_SIZE) await flushBatch();
      }
    } catch (e: any) {
      console.error(`  Error processing ${file}: ${e.message}`);
    }
  }

  // Process CSV files
  for (const file of csvFiles) {
    const csvContent = fs.readFileSync(path.join(FREIGHT_DIR, file), 'utf-8');
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) continue;

    const header = lines[0].split(',');
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',');
      const row: Record<string, string> = {};
      header.forEach((h, j) => { row[h.trim()] = (values[j] || '').trim(); });

      const kiId = uuid();
      const title = `Freight ${file.replace('.csv', '')}: ${Object.values(row).slice(0, 3).join(' ')}`;
      const content = `${file}: ${JSON.stringify(row).substring(0, 3000)}`;

      batch.push({
        id: uuid(),
        index_name: file.replace('.csv', ''),
        collection_time: new Date().toISOString(),
        source: file,
        data: row,
        knowledge_item_id: kiId,
        embedding_status: 'pending',
        title,
        content,
      });
      if (batch.length >= BATCH_SIZE) await flushBatch();
    }
  }

  await flushBatch();
  console.log(`[import] freight done: ${totalRecords} total records`);
}

importFreight().catch(e => { console.error(e); process.exit(1); });
