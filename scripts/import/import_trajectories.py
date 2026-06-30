#!/usr/bin/env python3
"""
Import TrAISformer Danish maritime AIS trajectories into PostgreSQL.

Data: 13,679 trajectories, ~1M points (train/test/valid splits)
Each trajectory: {mmsi: int, traj: np.ndarray}
  ndarray columns: [lon, lat, sog, cog, timestamp_unix, mmsi]

Usage: python3 scripts/import/import_trajectories.py
"""

import pickle, psycopg2, psycopg2.extras, sys, math
from datetime import datetime, timezone

DB = "postgresql://localhost:5432/shiprag"
SPLITS = {
    'train': '/Volumes/Data/workplace/data/TrAISformer/data/ct_dma/ct_dma_train.pkl',
    'valid': '/Volumes/Data/workplace/data/TrAISformer/data/ct_dma/ct_dma_valid.pkl',
    'test': '/Volumes/Data/workplace/data/TrAISformer/data/ct_dma/ct_dma_test.pkl',
}

BATCH_SIZE = 5000

def main():
    conn = psycopg2.connect(DB)
    cur = conn.cursor()

    # Clear existing data
    cur.execute("TRUNCATE trajectory_points RESTART IDENTITY CASCADE")

    grand_traj = 0
    grand_pts = 0

    for split_name, path in SPLITS.items():
        print(f"\n[{split_name}] Loading {path}...")
        with open(path, 'rb') as f:
            data = pickle.load(f)

        print(f"  {len(data)} trajectories")
        traj_count = 0
        pt_count = 0
        batch_rows = []

        for traj_idx, item in enumerate(data):
            mmsi = int(item['mmsi'])
            traj = item['traj']  # numpy ndarray: [lon, lat, sog, cog, ts, mmsi]
            traj_len = len(traj)
            traj_uid = f"{split_name}_{mmsi}_{traj_idx}"

            for pt_idx, row in enumerate(traj):
                lon, lat, sog, cog, ts_unix, _ = row
                # Convert unix timestamp to datetime
                ts_dt = datetime.fromtimestamp(ts_unix, tz=timezone.utc)

                batch_rows.append((
                    mmsi, split_name, traj_uid, pt_idx,
                    float(lon), float(lat),
                    float(sog), float(cog),
                    ts_dt, traj_len
                ))

                if len(batch_rows) >= BATCH_SIZE:
                    psycopg2.extras.execute_values(
                        cur,
                        """INSERT INTO trajectory_points (mmsi, split, traj_uid, point_idx, lon, lat, sog, cog, ts, traj_length)
                           VALUES %s""",
                        batch_rows,
                        template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
                    )
                    pt_count += len(batch_rows)
                    batch_rows = []
                    conn.commit()
                    print(f"  {pt_count:,} points...", end='\r')

            traj_count += 1

        # Flush remaining
        if batch_rows:
            psycopg2.extras.execute_values(
                cur,
                """INSERT INTO trajectory_points (mmsi, split, traj_uid, point_idx, lon, lat, sog, cog, ts, traj_length)
                   VALUES %s""",
                batch_rows,
                template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
            )
            pt_count += len(batch_rows)
            batch_rows = []
            conn.commit()

        print(f"  [{split_name}] done: {traj_count} trajectories, {pt_count:,} points")
        grand_traj += traj_count
        grand_pts += pt_count

    # Summary statistics
    cur.execute("""
        SELECT split,
               COUNT(DISTINCT traj_uid) as trajectories,
               COUNT(*) as points,
               COUNT(DISTINCT mmsi) as ships,
               MIN(ts) as start_time,
               MAX(ts) as end_time
        FROM trajectory_points
        GROUP BY split ORDER BY split
    """)
    print("\n=== Import Summary ===")
    for row in cur.fetchall():
        print(f"  {row[0]:6s}: {row[1]:>5} trajs, {row[2]:>8,} pts, {row[3]:>4} ships, {row[4]} → {row[5]}")
    print(f"  TOTAL: {grand_traj} trajs, {grand_pts:,} pts")

    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
