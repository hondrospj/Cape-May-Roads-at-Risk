#!/usr/bin/env python3
"""Validate existing Cape May products and record their source clocks and hashes."""
import argparse, datetime as dt, hashlib, json, math, os, re, urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo
UTC = dt.timezone.utc
def moment(value):
    return dt.datetime.fromisoformat(str(value).replace('Z', '+00:00')).astimezone(UTC)
def recent(value, now, hours, label):
    age = (now-moment(value)).total_seconds()/3600
    assert -1 <= age <= hours, f'{label} is stale or in the future: {value} ({age:.2f}h)'
def newest_available_cycle(now):
    base='https://nomads.ncep.noaa.gov/pub/data/nccf/com/petss/prod/'
    def get(url):
        with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ShorelySafe-freshness/1.0'}),timeout=60) as response:return response.read().decode()
    dates=sorted(set(re.findall(r'petss\.(\d{8})/',get(base))),reverse=True)
    for date in dates[:3]:
        listing=get(base+'petss.'+date+'/')
        cycles=[]
        for hour in re.findall(r'petss\.t(\d{2})z\.csv\.tar\.gz',listing):
            stamp=dt.datetime.strptime(date+hour,'%Y%m%d%H').replace(tzinfo=UTC)
            if stamp<=now:cycles.append(stamp)
        if cycles:return max(cycles).isoformat()
    raise AssertionError('Cannot establish the latest available NOAA station CSV cycle')
def observed_clock(data):
    assert str(data['site']) == '01411390' and data['parameterCd'] == '72279' and data['datum']=='NAVD88'
    hours=[h for day in data['days'][-3:] for h in day.get('hours', [])]
    # The archive stores exact local hour keys, including its existing DST policy.
    clocks=[]
    for day in data['days'][-3:]:
        for h in day.get('hours', []):
            value=h.get('navd88StageFt'); assert isinstance(value,(int,float)) and math.isfinite(value)
            clocks.append(dt.datetime.fromisoformat(day['date']).replace(hour=int(h['hourIndex']),tzinfo=ZoneInfo('America/New_York')).astimezone(UTC))
    assert clocks, 'No recent measured observations'
    return max(clocks).isoformat().replace('+00:00','Z')
def build(mode, root, now=None, probe=True):
    now=now or dt.datetime.now(UTC); root=Path(root)
    receipt={'schema':'shorelysafe-refresh-v1','town':'Cape May','product':mode,'runAt':now.isoformat().replace('+00:00','Z'),'repository':os.environ.get('GITHUB_REPOSITORY'),'runUrl':f"https://github.com/{os.environ.get('GITHUB_REPOSITORY','')}/actions/runs/{os.environ.get('GITHUB_RUN_ID','')}",'payloads':{}}
    if mode=='flooddashboard':
        meta=json.loads((root/'data/petss_meta.json').read_text()); rows=json.loads((root/'data/petss_forecast.json').read_text())
        assert meta['stid']=='8536110' and meta['datum']=='MLLW' and meta['forecast_statistic']=='ensemble_mean' and not meta['custom_bias_correction']
        cycle=dt.datetime.strptime(meta['run_dir'][-8:]+meta['cycle'][1:3],'%Y%m%d%H').replace(tzinfo=UTC).isoformat()
        recent(cycle,now,24,'PETSS cycle'); recent(meta['updated_utc'],now,2,'Forecast refresh')
        assert len(rows)==meta['n_points'] and len(rows)>=48
        receipt.update(gauge='8536110',gaugeName='Cape May Canal',datum='MLLW',source=meta['source_url'],latestUpstreamCycle=cycle,sourceUpdatedAt=meta['updated_utc'])
        paths=['data/petss_forecast.json','data/petss_forecast.csv','data/petss_meta.json','data/peaks_navd88.json']
    elif mode=='floodmapper':
        data=json.loads((root/'forecast.json').read_text()); obs=json.loads((root/'observed.json').read_text())
        assert data['stationId']=='8535901' and data['usgsGaugeId']=='01411390' and data['mapDatum']=='NAVD88'
        assert data['navd88OffsetFromMllwFt']==-2.77
        recent(data['petssCycleUtc'],now,24,'PETSS cycle');recent(data['issuedUtc'],now,2,'Forecast refresh')
        assert moment(data['forecastEndUtc'])>now+dt.timedelta(hours=24),'Forecast coverage is too short'
        hours=data['scenarioForecasts']['mean']['hours']; assert len(hours)>=24 and all(math.isfinite(h['navd88StageFt']) for h in hours)
        assert all(moment(a['timeUtc'])<moment(b['timeUtc']) for a,b in zip(hours,hours[1:])), 'Forecast times must be sorted'
        latest=observed_clock(obs);recent(latest,now,6,'Actual measured observation');recent(obs['lastProcessedISO'],now,2,'Observed refresh')
        receipt.update(gauge='01411390',petssGauge='8535901',gaugeName='Cape May Harbor',datum='NAVD88',parameter='72279',source=data['sourceUrl'],latestUpstreamCycle=data['petssCycleUtc'],latestObservation=latest,observationSource=obs.get('sourceUrlTemplate'),sourceUpdatedAt=obs['lastProcessedISO'])
        paths=['forecast.json','observed.json','toptides.json']
    else:
        data=json.loads((root/'flood_stats.json').read_text()); source=data['observationRefresh']
        assert data['station']['usgsGaugeId']=='01411390' and data['station']['datum']=='NAVD88'
        recent(source['latestObservationUtc'],now,6,'Actual measured observation');recent(source['fetchedAtUtc'],now,2,'Historical archive refresh')
        receipt.update(gauge='01411390',gaugeName='Cape May Harbor',datum='NAVD88',parameter='72279',source=source['sourceUrl'],latestObservation=source['latestObservationUtc'],archiveEndDate=data['archive']['endDate'],calibrationUnchanged=True,sourceUpdatedAt=source['fetchedAtUtc'])
        paths=['flood_stats.json']
    for name in paths:
        raw=(root/name).read_bytes(); assert not raw.startswith(b'version https://git-lfs'), f'LFS pointer: {name}'
        receipt['payloads'][name]={'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)}
    if mode in {'flooddashboard','floodmapper'} and probe:
        latest=newest_available_cycle(now)
        assert moment(latest)==moment(receipt['latestUpstreamCycle']),f'Selected PETSS cycle {receipt["latestUpstreamCycle"]} differs from newest available {latest}'
        receipt['latestAvailableCycleVerified']=latest
    receipt['validated']=True
    return receipt
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--product',required=True,choices=['flooddashboard','floodmapper','roads-at-risk']);parser.add_argument('--check-only',action='store_true');args=parser.parse_args()
    receipt=build(args.product,'.')
    if args.check_only:
        retained=json.loads(Path('data/refresh_status.json').read_text());recent(retained['runAt'],dt.datetime.now(UTC),2,'Validated refresh receipt')
        assert retained['payloads']==receipt['payloads'],'Payloads changed since the validated refresh receipt'
    else:
        Path('data').mkdir(exist_ok=True);Path('data/refresh_status.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt))
