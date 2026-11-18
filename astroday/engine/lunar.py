"""ASTRODAY lunar module: lunar days (лунные сутки) and void-of-course Moon (Луна без курса).

Methodology (documented in docs/LUNAR_CALENDAR_SPEC.md):

* Lunar days follow the Russian-language tradition used by most lunar calendars:
  day 1 starts at the exact new moon (geocentric Sun–Moon conjunction) and lasts until
  the first local moonrise after it; every following lunar day starts at a local moonrise
  and ends at the next moonrise; the cycle restarts at the next new moon (so the last
  day of a cycle is cut short by the new moon).  Moonrise = upper limb on the horizon,
  standard refraction, geocentric parallax (Meeus h0 = 0.7275*pi - 0:34).
  If no moonrise happens within a local day (polar latitudes) the current lunar day
  simply continues; we never invent a boundary.
* The lunar day shown in a daily forecast = the lunar day in force at 12:00 local time
  of the reader's current city (ASTRODAY editorial rule).
* Void of course (modern school): from the last exact Ptolemaic aspect
  (0/60/90/120/180) of the Moon to any of Sun, Mercury, Venus, Mars, Jupiter, Saturn,
  Uranus, Neptune, Pluto while the Moon is in a sign, until the Moon enters the next
  sign.  One geocentric interval, computed on the UTC axis; local display is done by
  the caller.

The module is ephemeris-agnostic: it uses a provider with
    ecl(body, ts) -> ecliptic longitude (deg, tropical, of date)
    equ(body, ts) -> (ra_deg, dec_deg, distance_earth_radii)
    gast(ts)      -> Greenwich apparent sidereal time (deg)
Production uses SwissProvider (pyswisseph); tests can plug in an independent provider.
"""
from __future__ import annotations

from datetime import datetime, timedelta, date, timezone
from math import sin, cos, asin, acos, radians, degrees, floor
from zoneinfo import ZoneInfo

LUNAR_VERSION = 'astroday-lunar-v1'
UTC = timezone.utc
VOC_BODIES = ('Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto')
PTOLEMAIC = (0.0, 60.0, 90.0, 120.0, 180.0, 240.0, 270.0, 300.0)  # 240/270/300 = same aspects on the other side
ASPECT_NAME = {0.0: 'conjunction', 60.0: 'sextile', 90.0: 'square', 120.0: 'trine', 180.0: 'opposition',
               240.0: 'trine', 270.0: 'square', 300.0: 'sextile'}
SIGNS = ('Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces')
SYNODIC = 29.530588 * 86400


def _norm(x: float) -> float:
    return x % 360.0


def _signed(x: float) -> float:
    return ((x + 180.0) % 360.0) - 180.0


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(round(ts), UTC).isoformat().replace('+00:00', 'Z')


def _bisect(f, a: float, b: float, tol: float = 1.0) -> float:
    fa = f(a)
    for _ in range(60):
        m = (a + b) / 2
        fm = f(m)
        if (fa > 0) == (fm > 0):
            a, fa = m, fm
        else:
            b = m
        if b - a <= tol:
            break
    return (a + b) / 2


class SwissProvider:
    """Swiss Ephemeris (pyswisseph) provider; same library and flags as engine.py."""

    def __init__(self):
        import swisseph as swe
        self.swe = swe
        self.codes = {'Sun': swe.SUN, 'Moon': swe.MOON, 'Mercury': swe.MERCURY, 'Venus': swe.VENUS,
                      'Mars': swe.MARS, 'Jupiter': swe.JUPITER, 'Saturn': swe.SATURN, 'Uranus': swe.URANUS,
                      'Neptune': swe.NEPTUNE, 'Pluto': swe.PLUTO}
        self._cache = {}

    def _jd(self, ts: float) -> float:
        return ts / 86400.0 + 2440587.5

    def ecl(self, body: str, ts: float) -> float:
        key = (body, round(ts))
        v = self._cache.get(key)
        if v is None:
            pos, _ = self.swe.calc_ut(self._jd(round(ts)), self.codes[body], self.swe.FLG_SWIEPH)
            v = self._cache[key] = _norm(pos[0])
            if len(self._cache) > 400000:
                self._cache.clear()
        return v

    def equ(self, body: str, ts: float):
        pos, _ = self.swe.calc_ut(self._jd(ts), self.codes[body], self.swe.FLG_SWIEPH | self.swe.FLG_EQUATORIAL)
        dist_er = pos[2] * 149597870.7 / 6378.137  # AU -> Earth radii
        return (pos[0], pos[1], dist_er)

    def gast(self, ts: float) -> float:
        return self.swe.sidtime(self._jd(ts)) * 15.0


# ---------------------------------------------------------------- Moon sign ingresses

def moon_ingresses(p, start_ts: float, end_ts: float) -> list[dict]:
    """All Moon sign ingresses in [start, end). The Moon is never retrograde."""
    out = []
    step = 2 * 3600
    t = start_ts
    prev = p.ecl('Moon', t)
    while t < end_ts:
        n = min(t + step, end_ts)
        cur = p.ecl('Moon', n)
        if int(prev // 30) != int(cur // 30):
            boundary = (int(cur // 30) * 30) % 360
            root = _bisect(lambda x: _signed(p.ecl('Moon', x) - boundary), t, n)
            out.append({'ts': root, 'toSign': SIGNS[int(cur // 30)], 'fromSign': SIGNS[int(prev // 30)]})
        t, prev = n, cur
    return out


def moon_aspects(p, start_ts: float, end_ts: float, bodies=VOC_BODIES) -> list[dict]:
    """Exact Ptolemaic aspects of the Moon to the given bodies in [start, end)."""
    out = []
    step = 3600
    grid = []
    t = start_ts
    while t < end_ts:
        grid.append(t)
        t += step
    grid.append(end_ts)
    for body in bodies:
        def diff(x, body=body):
            return p.ecl('Moon', x) - p.ecl(body, x)
        vals = [diff(x) for x in grid]
        for target in PTOLEMAIC:
            for (a, va), (b, vb) in zip(zip(grid, vals), zip(grid[1:], vals[1:])):
                sa, sb = _signed(va - target), _signed(vb - target)
                if sa == 0:
                    out.append({'ts': a, 'body': body, 'aspect': ASPECT_NAME[target], 'angle': target})
                elif sa < 0 < sb and (sb - sa) < 90:
                    root = _bisect(lambda x: _signed(diff(x) - target), a, b)
                    if start_ts <= root < end_ts:
                        out.append({'ts': root, 'body': body, 'aspect': ASPECT_NAME[target], 'angle': target})
    out.sort(key=lambda e: e['ts'])
    return out


def void_of_course(p, start_ts: float, end_ts: float) -> list[dict]:
    """Void-of-course intervals overlapping [start, end).

    Each interval: start = last exact Moon aspect inside the sign stay,
    end = ingress into the next sign.
    """
    pad = 3.5 * 86400
    ingresses = moon_ingresses(p, start_ts - pad, end_ts + pad)
    out = []
    for a, b in zip(ingresses, ingresses[1:]):
        if b['ts'] <= start_ts or a['ts'] >= end_ts + 3 * 86400:
            continue
        aspects = moon_aspects(p, a['ts'] + 1, b['ts'])
        last = aspects[-1] if aspects else None
        vstart = last['ts'] if last else a['ts']
        if b['ts'] > start_ts and vstart < end_ts:
            out.append({
                'startUtc': _iso(vstart), 'endUtc': _iso(b['ts']),
                'startTs': round(vstart), 'endTs': round(b['ts']),
                'moonSign': a['toSign'], 'nextSign': b['toSign'],
                'lastAspect': None if not last else {'body': last['body'], 'aspect': last['aspect']},
                'method': 'modern_ptolemaic_sun_to_pluto',
            })
    return out


# ---------------------------------------------------------------- new moons and moonrise

def new_moons(p, start_ts: float, end_ts: float) -> list[float]:
    out = []
    step = 6 * 3600
    t = start_ts
    def el(x):
        return _signed(p.ecl('Moon', x) - p.ecl('Sun', x))
    prev = el(t)
    while t < end_ts:
        n = min(t + step, end_ts)
        cur = el(n)
        if prev < 0 <= cur and cur - prev < 90:
            out.append(_bisect(el, t, n))
        t, prev = n, cur
    return out


def moon_altitude(p, ts: float, lat: float, lon: float) -> float:
    ra, dec, _ = p.equ('Moon', ts)
    ha = radians(_norm(p.gast(ts) + lon - ra))
    la, de = radians(lat), radians(dec)
    return degrees(asin(sin(la) * sin(de) + cos(la) * cos(de) * cos(ha)))


def _h0(p, ts: float) -> float:
    _, _, dist = p.equ('Moon', ts)
    parallax = degrees(asin(1.0 / dist))
    return 0.7275 * parallax - 34.0 / 60.0


def moonrises(p, start_ts: float, end_ts: float, lat: float, lon: float) -> list[float]:
    """Moonrise instants (upward crossings of h0) in [start, end), 10-minute scan + bisection."""
    out = []
    step = 600
    def f(x):
        return moon_altitude(p, x, lat, lon) - _h0(p, x)
    t = start_ts
    prev = f(t)
    while t < end_ts:
        n = min(t + step, end_ts)
        cur = f(n)
        if prev < 0 <= cur:
            out.append(_bisect(f, t, n, 5.0))
        t, prev = n, cur
    return out


# ---------------------------------------------------------------- lunar days

def lunar_day_segments(p, start_ts: float, end_ts: float, lat: float, lon: float) -> list[dict]:
    """Lunar-day segments overlapping [start, end) for a location.

    Segment: {number, startTs, endTs, startKind: new_moon|moonrise, endKind}
    """
    lo = start_ts - 31 * 86400
    hi = end_ts + 2 * 86400
    nms = new_moons(p, lo, hi)
    if not nms:
        raise ValueError('no new moon found in search window')
    rises = moonrises(p, nms[0], hi, lat, lon)
    segs = []
    for i, nm in enumerate(nms):
        nxt = nms[i + 1] if i + 1 < len(nms) else None
        cut = nxt if nxt is not None else hi
        bounds = [nm] + [r for r in rises if nm < r < cut]
        for k, s in enumerate(bounds):
            e = bounds[k + 1] if k + 1 < len(bounds) else (nxt if nxt is not None else None)
            if e is None:
                break  # open segment after the last known boundary: cannot be closed reliably
            segs.append({'number': k + 1, 'startTs': round(s), 'endTs': round(e),
                         'startKind': 'new_moon' if k == 0 else 'moonrise',
                         'endKind': 'moonrise' if k + 1 < len(bounds) else 'new_moon'})
    return [s for s in segs if s['endTs'] > start_ts and s['startTs'] < end_ts]


def local_noon_ts(day: str, zone: str) -> float:
    d = date.fromisoformat(day)
    return datetime(d.year, d.month, d.day, 12, 0, tzinfo=ZoneInfo(zone)).timestamp()


def day_bounds_ts(day: str, zone: str) -> tuple[float, float]:
    d = date.fromisoformat(day)
    z = ZoneInfo(zone)
    a = datetime(d.year, d.month, d.day, tzinfo=z).timestamp()
    nd = d + timedelta(days=1)
    b = datetime(nd.year, nd.month, nd.day, tzinfo=z).timestamp()
    return a, b


def lunar_calendar(p, start_day: str, days: int, zone: str, lat: float, lon: float) -> dict:
    """Per local date: lunar day at local noon, all segments touching the date, VoC overlapping the date."""
    if not 1 <= days <= 400:
        raise ValueError('days must be 1..400')
    first = date.fromisoformat(start_day)
    a0, _ = day_bounds_ts(start_day, zone)
    last_day = (first + timedelta(days=days - 1)).isoformat()
    _, b1 = day_bounds_ts(last_day, zone)
    segs = lunar_day_segments(p, a0, b1, lat, lon)
    vocs = void_of_course(p, a0, b1)
    rows = []
    for i in range(days):
        day = (first + timedelta(days=i)).isoformat()
        a, b = day_bounds_ts(day, zone)
        noon = local_noon_ts(day, zone)
        at_noon = next((s for s in segs if s['startTs'] <= noon < s['endTs']), None)
        touching = [s for s in segs if s['endTs'] > a and s['startTs'] < b]
        rows.append({
            'day': day,
            'lunarDayAtNoon': None if at_noon is None else at_noon['number'],
            'lunarDayAtNoonSegment': None if at_noon is None else {**at_noon, 'startUtc': _iso(at_noon['startTs']), 'endUtc': _iso(at_noon['endTs'])},
            'changesDuringDay': len(touching) > 1,
            'segments': [{**s, 'startUtc': _iso(s['startTs']), 'endUtc': _iso(s['endTs'])} for s in touching],
            'voidOfCourse': [v for v in vocs if v['endTs'] > a and v['startTs'] < b],
        })
    return {'lunarVersion': LUNAR_VERSION, 'timeZone': zone, 'latitude': lat, 'longitude': lon,
            'rule': 'lunar_day_at_local_noon', 'vocMethod': 'modern_ptolemaic_sun_to_pluto', 'days': rows}
