#!/usr/bin/env python3
"""
Import IHO Sea Areas and EEZ Boundaries from Shapefiles into Data Center API.

Usage:
  python3 scripts/import/import_geography.py [--sample N]
"""

import sys, os, json, urllib.request, uuid, math

API_BASE = os.environ.get('API_BASE', 'http://localhost:5000')

GEO_DATA = {
    'sea_areas': {
        'shp': '/Volumes/Data/workplace/data/地理解析/iho_sea_areas/shapefile/World_Seas_IHO_v3.shp',
        'module': 'sea_area',
        'fields_map': {},  # auto-detect from dbf
        'text_gen': lambda props: {
            'title': f"IHO Sea Area: {props.get('NAME', props.get('name', 'Unknown'))}",
            'content': f"Sea Area: {props.get('NAME', props.get('name', 'Unknown'))}. Type: {props.get('SEA_TYPE', props.get('sea_type', ''))}. Region: {props.get('REGION', '')}. This is an International Hydrographic Organization defined sea area."
        }
    },
    'eez': {
        'shp': '/Volumes/Data/workplace/data/地理解析/eez/eez_v12_shapefile/eez_v12.shp',
        'module': 'eez',
        'fields_map': {},
        'text_gen': lambda props: {
            'title': f"EEZ: {props.get('SOVEREIGN', props.get('sovereign', 'Unknown'))}",
            'content': f"Exclusive Economic Zone of {props.get('SOVEREIGN', 'Unknown')}. Area: {props.get('AREA_KM2', props.get('area_km2', ''))} sq km. ISO: {props.get('ISO_TER', props.get('iso_ter', ''))}. Territory: {props.get('TERRITORY', '')}."
        }
    },
    'eez_boundaries': {
        'shp': '/Volumes/Data/workplace/data/地理解析/eez/eez_v12_shapefile/eez_boundaries_v12.shp',
        'module': 'eez',
        'fields_map': {},
        'text_gen': lambda props: {
            'title': f"EEZ Boundary: {props.get('LINE_TYPE', props.get('line_type', 'Unknown'))}",
            'content': f"EEZ Boundary line. Type: {props.get('LINE_TYPE', '')}. Between: {props.get('SOV1', '')} - {props.get('SOV2', '')}. "
        }
    }
}


def safe_float(v, default=0):
    try: return float(v)
    except: return default


def bounds_from_shape(shape):
    """Extract bounding box from shape."""
    try:
        return {
            'xmin': shape.bbox[0], 'ymin': shape.bbox[1],
            'xmax': shape.bbox[2], 'ymax': shape.bbox[3]
        }
    except:
        return {}


def centroid_from_bounds(shape):
    """Approximate centroid from bounding box."""
    try:
        return {
            'lon': (shape.bbox[0] + shape.bbox[2]) / 2,
            'lat': (shape.bbox[1] + shape.bbox[3]) / 2,
        }
    except:
        return {'lon': 0, 'lat': 0}


def import_shapefile(key, config, sample_size=None):
    """Read a shapefile and POST records to the Data Center API."""
    shp_path = config['shp']
    module_name = config['module']
    text_gen = config['text_gen']

    if not os.path.exists(shp_path):
        print(f'  [SKIP] {shp_path} not found')
        return 0

    import shapefile
    sf = shapefile.Reader(shp_path)

    # Extract field names from DBF
    field_names = [f[0] for f in sf.fields[1:]]
    records = sf.records()
    shapes = sf.shapes()

    total = min(len(records), sample_size) if sample_size else len(records)
    print(f'  [import] {key}: {len(records)} features in {shp_path}')

    batch = []
    batch_size = 100
    imported = 0

    for i in range(total):
        record = records[i]
        shape = shapes[i]
        props = dict(zip(field_names, record))

        # Decode bytes values
        for k, v in list(props.items()):
            if isinstance(v, bytes):
                try:
                    props[k] = v.decode('utf-8', errors='replace')
                except:
                    props[k] = str(v)

        gen = text_gen(props)
        ki_id = str(uuid.uuid4())

        db_row = {
            'id': str(uuid.uuid4()),
            'knowledge_item_id': ki_id,
            'embedding_status': 'pending',
            'title': gen['title'],
            'content': gen['content'],
            'metadata': json.dumps(props, ensure_ascii=False, default=str),
        }

        # Add type-specific fields
        if module_name == 'sea_area':
            db_row['name'] = props.get('NAME', props.get('name', 'Unknown'))
            db_row['sea_type'] = props.get('SEA_TYPE', props.get('sea_type', ''))
            db_row['bounds'] = json.dumps(bounds_from_shape(shape))
        elif module_name == 'eez':
            db_row['country'] = props.get('SOVEREIGN', props.get('sovereign', 'Unknown'))
            db_row['area_sqkm'] = str(props.get('AREA_KM2', props.get('area_km2', '')))
            db_row['bounds'] = json.dumps(bounds_from_shape(shape))

        batch.append(db_row)

        if len(batch) >= batch_size:
            _post_batch(module_name, batch, key)
            imported += len(batch)
            print(f'    Imported {imported}/{total} {key} features')
            batch.clear()

    if batch:
        _post_batch(module_name, batch, key)
        imported += len(batch)

    print(f'  [done] {key}: {imported} imported')
    return imported


def _post_batch(module_name, batch, source_file):
    """POST a batch of records to the API."""
    try:
        data = json.dumps({
            'action': 'import',
            'module': module_name,
            'records': batch,
            'sourceFile': source_file,
        }, default=str).encode('utf-8')
        req = urllib.request.Request(
            f'{API_BASE}/api/data-center',
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        resp = urllib.request.urlopen(req, timeout=60)
        result = json.loads(resp.read())
        if not result.get('success'):
            print(f'    API error: {result}')
    except Exception as e:
        print(f'    POST failed: {e}')


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--sample', type=int, default=0, help='Sample N features per shapefile')
    args = parser.parse_args()

    total = 0
    for key in ['sea_areas', 'eez', 'eez_boundaries']:
        config = GEO_DATA[key]
        n = import_shapefile(key, config, args.sample or None)
        total += n

    print(f'\nTotal imported: {total} geography features')


if __name__ == '__main__':
    main()
