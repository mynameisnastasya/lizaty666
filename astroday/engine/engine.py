"""ASTRODAY verified tropical Placidus forecast engine (Swiss Ephemeris).

All positions are geocentric ecliptic tropical longitudes.  Every event is
calculated from one shared UTC time axis, then grouped by recipient IANA zone.
No horoscope text is produced here; prose must cite an event or an active aspect.

Swiss Ephemeris/pyswisseph: AGPL-3.0 or commercial license, see README.
"""
from __future__ import annotations

from datetime import datetime, timedelta, date, timezone
from functools import lru_cache
from itertools import combinations
from math import floor, isfinite
from zoneinfo import ZoneInfo
import swisseph as swe

VERSION = 'astro-v2-placidus-swe-2.10'
ZODIAC = 'tropical'
HOUSE_SYSTEM = 'placidus'
BODY_CODES = {
    'Sun': swe.SUN, 'Moon': swe.MOON, 'Mercury': swe.MERCURY,
    'Venus': swe.VENUS, 'Mars': swe.MARS, 'Jupiter': swe.JUPITER,
    'Saturn': swe.SATURN, 'Uranus': swe.URANUS, 'Neptune': swe.NEPTUNE,
    'Pluto': swe.PLUTO,
}
BODIES = tuple(BODY_CODES)
SLOW = ('Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto')
ASPECT_ANGLES = (0, 60, 90, 120, 180, 240, 270, 300)
ASPECT_NAMES = {0:'conjunction', 60:'sextile',90:'square',120:'trine',180:'opposition',240:'trine',270:'square',300:'sextile'}
SIGNS = ('Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces')
UTC = timezone.utc


def ensure_utc(value: str | datetime) -> datetime:
    dt = datetime.fromisoformat(value.replace('Z','+00:00')) if isinstance(value, str) else value
    if dt.tzinfo is None:
        raise ValueError('Timezone-aware UTC birth/forecast instant required')
    return dt.astimezone(UTC)


def jd_for(dt: datetime) -> float:
    dt = ensure_utc(dt)
    hour = dt.hour + dt.minute/60 + (dt.second + dt.microsecond/1_000_000)/3600
    return swe.julday(dt.year,dt.month,dt.day,hour,swe.GREG_CAL)


def norm(x:float) -> float:
    return x % 360.0


def signed(x:float) -> float:
    return ((x + 180.0) % 360.0) - 180.0


def sign(longitude:float) -> str:
    return SIGNS[int(norm(longitude)//30)]


def zod(longitude:float) -> dict:
    return {'sign':sign(longitude),'degree':round(norm(longitude)%30,6),'longitude':round(norm(longitude),8)}


@lru_cache(maxsize=500000)
def _position(name:str, t:int) -> tuple[float,float,str]:
    if name not in BODY_CODES: raise ValueError(f'Unknown planetary body: {name}')
    instant=datetime.fromtimestamp(t,UTC)
    # Ask Swiss first; without local .se1 files the Swiss library falls back to Moshier.
    (pos, flags)=swe.calc_ut(jd_for(instant),BODY_CODES[name],swe.FLG_SWIEPH|swe.FLG_SPEED)
    method='swiss_file' if flags & swe.FLG_SWIEPH else ('moshier' if flags & swe.FLG_MOSEPH else 'other')
    return (norm(pos[0]),pos[3],method)


def longitude(name:str,dt:datetime) -> float:
    return _position(name,int(dt.timestamp()))[0]


def speed(name:str,dt:datetime) -> float:
    return _position(name,int(dt.timestamp()))[1]


def birth_chart(birth:dict) -> dict:
    dt=ensure_utc(birth['at'])
    accurate=birth.get('accurateBirthTime') is True
    lat=float(birth['latitude']);lon=float(birth['longitude'])
    if not all(map(isfinite,(lat,lon))) or not -85<=lat<=85 or not -180<=lon<=180:
        raise ValueError('Birth coordinates out of range')
    n={}
    for name in BODIES:
        if name=='Moon' and not accurate: continue
        angle,spd,method=_position(name,int(dt.timestamp()))
        n[name]={**zod(angle),'speedDegPerDay':round(spd,8)}
    cusp=None;axes=None
    if accurate:
        try:
            # P is Placidus.  This must never silently fall back to whole-sign.
            cusps,ax=swe.houses_ex(jd_for(dt),lat,lon,b'P',0)
            cusp=[norm(float(x)) for x in cusps]
            if len(cusp)!=12 or not all(isfinite(x) for x in cusp): raise ValueError('Placidus cusps unavailable')
            axes={'ascendant':round(norm(ax[0]),8),'mc':round(norm(ax[1]),8)}
        except Exception as exc:
            raise ValueError('Cannot determine Placidus houses for these birth coordinates') from exc
    return {'birthAtUtc':dt.isoformat(),'birthLat':lat,'birthLon':lon,'houseSystem':HOUSE_SYSTEM,
            'zodiac':ZODIAC,'natalMoonReliable':accurate,'houseKnown':bool(cusp),
            'natalPositions':n,'houseCusps':None if cusp is None else [round(x,8) for x in cusp],
            'axes':axes,'ephemerisMethod':_position('Sun',int(dt.timestamp()))[2]}


def natal_house(angle:float,cusps:list[float]|None) -> int|None:
    if cusps is None:return None
    # A house is a half-open ecliptic arc from cusp_i to cusp_(i+1).
    angle=norm(angle)
    for i in range(12):
        width=(cusps[(i+1)%12]-cusps[i])%360
        if width<=0: raise ValueError('Invalid house cusp ordering')
        if (angle-cusps[i])%360 < width:return i+1
    raise ValueError('Transit does not fall into a Placidus house')


def day_bounds(day:str,zone:str)->tuple[datetime,datetime]:
    local=date.fromisoformat(day)
    z=ZoneInfo(zone)
    lo=datetime(local.year,local.month,local.day,tzinfo=z)
    hi=datetime.combine(local+timedelta(days=1),datetime.min.time(),tzinfo=z)
    if lo.astimezone(UTC)>=hi.astimezone(UTC):raise ValueError('Non-positive local calendar day')
    return (lo.astimezone(UTC),hi.astimezone(UTC))


def _time(ts:float,zone:str)->dict:
    dt=datetime.fromtimestamp(round(ts),UTC)
    return {'utc':dt.isoformat().replace('+00:00','Z'),
            'local':dt.astimezone(ZoneInfo(zone)).isoformat(timespec='seconds')}


def _bisect(f,a:float,b:float,target:float=0.0)->float:
    fa=f(a)-target;fb=f(b)-target
    if fa==0:return a
    if fb==0:return b
    if fa*fb>0:raise ValueError('Root not bracketed')
    for _ in range(42):
        m=(a+b)/2;fm=f(m)-target
        if fm==0:return m
        if (fa>0)==(fm>0):a=m;fa=fm
        else:b=m;fb=fm
        if b-a<0.4:break
    return (a+b)/2


def _samples(start:datetime,end:datetime,step_hours:int=3)->list[float]:
    a=start.timestamp();b=end.timestamp();step=step_hours*3600
    grid=[a+step*i for i in range(int((b-a)//step)+1)]
    if not grid or grid[-1]<b:grid.append(b)
    return grid


def _angle_cross(f,grid:list[float],angle:float)->list[float]:
    # Signed wrap around a fixed aspect target: discard spurious +/-180 jumps.
    roots=[]
    for a,b in zip(grid,grid[1:]):
        va=signed(f(a)-angle);vb=signed(f(b)-angle)
        if va==0 and a<grid[-1]: roots.append(a)
        elif va*vb<0 and abs(va-vb)<150:
            roots.append(_bisect(lambda t:signed(f(t)-angle),a,b))
    return roots


def moon_sign_and_house_events(start:datetime,end:datetime,zone:str,cusps:list[float]|None)->list[dict]:
    out=[];grid=_samples(start,end,2)
    def moon(t):return _position('Moon',round(t))[0]
    for a,b in zip(grid,grid[1:]):
        la=moon(a);lb=moon(b)
        if int(la//30)!=int(lb//30):
            direction='direct' if speed('Moon',datetime.fromtimestamp(a,UTC))>=0 else 'retrograde'
            boundary=(int(lb//30)*30 if direction=='direct' else int(la//30)*30)
            root=_bisect(lambda t:signed(moon(t)-boundary),a,b)
            if start.timestamp()<=root<end.timestamp():
                out.append({'type':'moon_sign_ingress','body':'Moon','fromSign':sign(la),'toSign':sign(lb),
                            'at':_time(root,zone)})
        if cusps is not None:
            ha=natal_house(la,cusps);hb=natal_house(lb,cusps)
            if ha!=hb:
                # Use cusp of entered house and longitude continuity across Aries zero.
                cusp=cusps[hb-1]
                root=_bisect(lambda t:signed(moon(t)-cusp),a,b)
                if start.timestamp()<=root<end.timestamp():
                    out.append({'type':'moon_natal_house_ingress','body':'Moon','fromHouse':ha,'toHouse':hb,'houseSystem':HOUSE_SYSTEM,'at':_time(root,zone)})
    return out


def other_sign_events(start:datetime,end:datetime,zone:str)->list[dict]:
    out=[];grid=_samples(start,end,3)
    for body in BODIES:
        if body=='Moon':continue
        def lon(t):return _position(body,round(t))[0]
        for a,b in zip(grid,grid[1:]):
            la,lb=lon(a),lon(b)
            if int(la//30)==int(lb//30):continue
            # Determine which cusp was crossed in either direction (retrograde is possible).
            direct=_position(body,round((a+b)/2))[1]>=0
            cusp=int((lb if direct else la)//30)*30
            root=_bisect(lambda t:signed(lon(t)-cusp),a,b)
            if start.timestamp()<=root<end.timestamp():
                out.append({'type':'planet_sign_ingress','body':body,'fromSign':sign(la),'toSign':sign(lb),'at':_time(root,zone)})
    return out


def station_events(start:datetime,end:datetime,zone:str)->list[dict]:
    out=[];grid=_samples(start,end,3)
    for body in BODIES:
        if body in ('Sun','Moon'):continue
        def sp(t):return _position(body,round(t))[1]
        for a,b in zip(grid,grid[1:]):
            v1,v2=sp(a),sp(b)
            if v1*v2>=0:continue
            root=_bisect(sp,a,b)
            if start.timestamp()<=root<end.timestamp():
                out.append({'type':'planet_station','body':body,'motion':'direct' if v2>0 else 'retrograde',
                            'longitude':round(_position(body,round(root))[0],6),'at':_time(root,zone)})
    return out


def phase_events(start:datetime,end:datetime,zone:str,cusps:list[float]|None)->list[dict]:
    out=[];grid=_samples(start,end,2)
    def phase(t):return _position('Moon',round(t))[0]-_position('Sun',round(t))[0]
    for target,kind in ((0,'new_moon'),(180,'full_moon')):
        for root in _angle_cross(phase,grid,target):
            if not start.timestamp()<=root<end.timestamp():continue
            angle=_position('Moon',round(root))[0]
            out.append({'type':kind,'body':'Moon','longitude':round(angle,6),
                        'sign':sign(angle),'natalHouse':natal_house(angle,cusps),'houseSystem':HOUSE_SYSTEM if cusps else None,
                        'at':_time(root,zone)})
    return out


def exact_aspect_events(start:datetime,end:datetime,zone:str,chart:dict,include_sky=True)->list[dict]:
    grid=_samples(start,end,3);out=[]
    eligible=[x for x in BODIES if x in chart['natalPositions']]
    for trans in BODIES:
        for natal in eligible:
            natal_lon=chart['natalPositions'][natal]['longitude']
            def diff(t):return _position(trans,round(t))[0]-natal_lon
            for target in ASPECT_ANGLES:
                for root in _angle_cross(diff,grid,target):
                    if start.timestamp()<=root<end.timestamp():
                        out.append({'type':'exact_personal_aspect','scope':'transit_natal','transit':trans,'natal':natal,
                                    'aspect':ASPECT_NAMES[target],'aspectAngle':target,'orbDeg':0.0,
                                    'at':_time(root,zone)})
    if include_sky:
        for one,two in combinations(BODIES,2):
            def diff(t):return _position(one,round(t))[0]-_position(two,round(t))[0]
            for target in ASPECT_ANGLES:
                for root in _angle_cross(diff,grid,target):
                    if start.timestamp()<=root<end.timestamp():
                        out.append({'type':'exact_sky_aspect','scope':'transit_transit',
                                    'transit':one,'otherTransit':two,'aspect':ASPECT_NAMES[target],
                                    'aspectAngle':target,'at':_time(root,zone)})
    return out


def active_personal_aspects(representative:datetime,chart:dict)->list[dict]:
    out=[];at=representative.timestamp()
    for trans in BODIES:
        tlon=_position(trans,round(at))[0]
        for natal,data in chart['natalPositions'].items():
            diff=tlon-data['longitude'];best=[]
            for target in ASPECT_ANGLES:
                orb=abs(signed(diff-target))
                cap=6 if trans in ('Sun','Moon','Mercury','Venus','Mars') else 3
                if orb>cap:continue
                future=abs(signed(_position(trans,round(at+3600))[0]-data['longitude']-target))
                best.append({'scope':'transit_natal','transit':trans,'natal':natal,'aspect':ASPECT_NAMES[target],
                             'aspectAngle':target,'orbDeg':round(orb,4),'orbLimitDeg':cap,
                             'state':'applying' if future<orb else ('separating' if future>orb else 'stationary')})
            out.extend(best)
    return sorted(out,key=lambda x:(x['orbDeg'],x['transit'],x['natal']))


def build_forecast(*,birth:dict,day:str,time_zone:str,local_hour:int=12,
                   include_sky:bool=True)->dict:
    start,end=day_bounds(day,time_zone)
    if not 0<=local_hour<=23:raise ValueError('local_hour must be 0..23')
    representative=datetime.fromisoformat(day+f'T{local_hour:02d}:00:00').replace(tzinfo=ZoneInfo(time_zone)).astimezone(UTC)
    if not start<=representative<end:raise ValueError('invalid local representative time')
    chart=birth_chart(birth);cusps=chart['houseCusps']
    moon=longitude('Moon',representative)
    pos={name:{**zod(longitude(name,representative)),
               'speedDegPerDay':round(speed(name,representative),7),
               'natalHouse':natal_house(longitude(name,representative),cusps)} for name in BODIES}
    events=(moon_sign_and_house_events(start,end,time_zone,cusps)
            +other_sign_events(start,end,time_zone)
            +station_events(start,end,time_zone)
            +phase_events(start,end,time_zone,cusps)
            +exact_aspect_events(start,end,time_zone,chart,include_sky))
    events.sort(key=lambda x:x['at']['utc'])
    exact_personal=[x for x in events if x['type']=='exact_personal_aspect']
    sky=[x for x in events if x['type']=='exact_sky_aspect']
    aspects=active_personal_aspects(representative,chart)
    background=[x for x in aspects if x['transit'] in SLOW]
    return {'version':VERSION,'day':day,'forecastUtc':representative.isoformat(),
            'localDate':day,'timeZone':time_zone,'representativeLocalHour':local_hour,
            'dayStartUtc':start.isoformat(),'dayEndUtcExclusive':end.isoformat(),
            'zodiac':ZODIAC,'houseSystem':HOUSE_SYSTEM,
            'houseKnown':chart['houseKnown'],'natalMoonReliable':chart['natalMoonReliable'],
            'ephemerisMethod':chart['ephemerisMethod'],
            'natalProfile':chart,
            'transitingMoon':{**pos['Moon'],'natalHouse':natal_house(moon,cusps)},
            'transitingPlanets':pos,
            'activeAspects':aspects,'backgroundAspects':background,
            'dayEvents':events,'dayExactContacts':{'personalExact':exact_personal,'skyExact':sky},
            'calculationStatus':'verified_v2',
            'eventsAreAstrologicalNotGuaranteedLifeEvents':True}


def factual_digest(calc:dict)->dict:
    """Minimal allowlist for downstream LLM; no raw user-supplied prose as instructions."""
    if calc.get('calculationStatus')!='verified_v2' or calc.get('houseSystem')!=HOUSE_SYSTEM:raise ValueError('Calculation not verified')
    events=[e for e in calc['dayEvents'] if e['type'] in (
        'moon_sign_ingress','moon_natal_house_ingress','planet_station','planet_sign_ingress',
        'new_moon','full_moon','exact_personal_aspect','exact_sky_aspect')]
    return {'date':calc['day'],'houseSystem':calc['houseSystem'],
            'houseKnown':calc['houseKnown'],'natalMoonReliable':calc['natalMoonReliable'],
            'moonAtLocalNoon':calc['transitingMoon'],
            'events':events,'activeAspects':calc['activeAspects'][:12],
            'persistentBackground':calc['backgroundAspects'][:8]}
