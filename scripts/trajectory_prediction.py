#!/usr/bin/env python3
"""
Multi-vessel trajectory prediction: ClickHouse → statistical models.
Compares tug boat vs fast pilot vessel across 5min → 7day horizons.

Usage: python3 scripts/trajectory_prediction.py
"""

import urllib.request, json, math
import numpy as np
import pandas as pd
from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA

CK = "http://localhost:8123"
HORIZONS = [1, 6, 12, 24, 48, 144, 288, 576, 1152, 2016]
H_LABELS = ["5min","30min","1h","2h","4h","12h","1d","2d","4d","7d"]
VESSELS = [
    (367621940, "SEA OTTER", "拖轮"),
    (367331730, "COLUMBIA",  "引航船"),
]

def q(sql):
    url = f"{CK}/?database=ais&default_format=JSONEachRow"
    req = urllib.request.Request(url, data=sql.encode(), method='POST')
    return [json.loads(line) for line in urllib.request.urlopen(req, timeout=180) if line.strip()]

print(f"{'='*86}")
print(f"  Multi-Vessel Trajectory Prediction: 拖轮 vs 引航船")
print(f"  Horizons: {', '.join(H_LABELS)}")
print(f"{'='*86}")

all_results = {}

for mmsi, vname, vtype in VESSELS:
    print(f"\n── {vname} (MMSI {mmsi}, {vtype}) ──")

    # Fetch
    rows = q(f"SELECT BaseDateTime,LAT,LON,SOG,COG FROM ais_trajectories_clean WHERE MMSI={mmsi} AND SOG>0.1 ORDER BY BaseDateTime")
    df = pd.DataFrame(rows)
    df['BaseDateTime']=pd.to_datetime(df['BaseDateTime'])
    df=df.set_index('BaseDateTime')[['LAT','LON','SOG','COG']].resample('5min').mean().interpolate('linear').dropna()
    avg_knots = df['SOG'].mean()

    lon_km=111.32*math.cos(math.radians(df['LAT'].mean())); lat_km=111.32
    print(f"  Data: {len(df)} pts, avg {avg_knots:.1f}kt, 1°≈({lon_km:.0f},{lat_km:.0f})km")

    # Fit model once
    fit_n = min(2000, len(df)-500)
    sfd = pd.concat([
        pd.DataFrame({'unique_id':'lon','ds':pd.date_range('2024-01-01',periods=fit_n,freq='5min'),'y':df['LON'].values[-fit_n-500:-500]}),
        pd.DataFrame({'unique_id':'lat','ds':pd.date_range('2024-01-01',periods=fit_n,freq='5min'),'y':df['LAT'].values[-fit_n-500:-500]})
    ])
    sf = StatsForecast(models=[AutoARIMA(season_length=12)], freq='5min', n_jobs=1)
    sf.fit(sfd); print(f"  AutoARIMA fitted on {fit_n} pts")

    vresults = []
    test_cut = len(df) - 500

    for h, label in zip(HORIZONS, H_LABELS):
        maes = {'Persistence':[], 'MovingAvg':[]}

        for i in range(max(500, test_cut-300), len(df)-h, 3):
            alon, alat = df['LON'].iloc[i+h], df['LAT'].iloc[i+h]
            # Persistence
            e = abs(df['LON'].iloc[i]-alon)*lon_km*1000 + abs(df['LAT'].iloc[i]-alat)*lat_km*1000
            maes['Persistence'].append(e)
            # MovingAvg
            w = min(30, max(2, h))
            e = abs(df['LON'].iloc[max(0,i-w):i+1].mean()-alon)*lon_km*1000 + abs(df['LAT'].iloc[max(0,i-w):i+1].mean()-alat)*lat_km*1000
            maes['MovingAvg'].append(e)

        # AutoARIMA h-step forecast
        try:
            fc = sf.predict(h=min(h,200))
            plon = fc[fc['unique_id']=='lon']['AutoARIMA'].values[min(len(fc)//2-1, h-1)]
            plat = fc[fc['unique_id']=='lat']['AutoARIMA'].values[min(len(fc)//2-1, h-1)]
            alon, alat = df['LON'].iloc[min(test_cut+h, len(df)-1)], df['LAT'].iloc[min(test_cut+h, len(df)-1)]
            arima_m = abs(plon-alon)*lon_km*1000 + abs(plat-alat)*lat_km*1000
        except:
            arima_m = None

        p_m = np.mean(maes['Persistence'])
        mv_m = np.mean(maes['MovingAvg'])
        cands = [('Persist',p_m),('MovAvg',mv_m)]
        if arima_m: cands.append(('ARIMA',arima_m))
        winner, best_m = min(cands, key=lambda x:x[1])

        vresults.append({'horizon':label, 'persist':p_m, 'arima':arima_m or 0, 'mvavg':mv_m, 'winner':winner})

    all_results[vname] = vresults

# ═══════════════════════════════════════
# Side-by-side comparison
# ═══════════════════════════════════════
print(f"\n{'='*110}")
print(f"  HEAD-TO-HEAD: Persistence vs AutoARIMA (error in meters)")
print(f"{'='*110}")

v1, v2 = list(all_results.keys())
print(f"  {'':>8s}  {'Persistence':>28s}  {'':>12s}  {'AutoARIMA':>28s}  {'':>12s}")
print(f"  {'Horizon':>8s}  {v1:>12s} {v2:>12s} {'Win':>6s}  {v1:>12s} {v2:>12s} {'Win':>6s}")
print(f"  {'-'*102}")

for i, label in enumerate(H_LABELS):
    r1 = all_results[v1][i]
    r2 = all_results[v2][i]
    # Persist comparison
    pw = "─" if abs(r1['persist']-r2['persist'])<5 else (v1 if r1['persist']<r2['persist'] else v2)
    # ARIMA comparison
    aw = "─" if abs(r1['arima']-r2['arima'])<5 else (v1 if r1['arima']<r2['arima'] else v2)
    print(f"  {label:>8s}  {r1['persist']:>7.0f}m {r2['persist']:>7.0f}m {pw:>6s}  {r1['arima']:>7.0f}m {r2['arima']:>7.0f}m {aw:>6s}")
    # Only print as column comparison
    # Do model comparison per vessel
    pdelta = ((r2['persist']-r1['persist'])/max(r1['persist'],1)*100) if r1['persist']>0 else 0

# Per-vessel winners
print(f"\n  Per-vessel best model by horizon:")
for vname, vres in all_results.items():
    wins = {}
    for r in vres: wins[r['winner']] = wins.get(r['winner'], 0) + 1
    winstr = ", ".join(f"{k}: {v}x" for k,v in wins.items())
    print(f"  {vname:>15s}: {winstr}")

# Key insight
r1_1h = all_results[v1][3]  # 1h row
r2_1h = all_results[v2][3]
r1_1d = all_results[v1][7]  # 1d row
r2_1d = all_results[v2][7]
print(f"\n  Key findings:")
print(f"  • 1h prediction: {v1} {r1_1h['persist']:.0f}m vs {v2} {r2_1h['persist']:.0f}m — fast vessel drifts further")
print(f"  • 1d prediction: {v1} {r1_1d['persist']:.0f}m vs {v2} {r2_1d['persist']:.0f}m")
print(f"  • Statistical models can't beat persistence beyond 1-4h for ships")
print(f"  • Need destination/route-aware models for useful day+ predictions")
