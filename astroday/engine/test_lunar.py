"""Unit tests of the lunar algorithms with the independent reference provider (no Swiss Ephemeris needed)."""
from datetime import datetime
from zoneinfo import ZoneInfo
from lunar import (void_of_course, new_moons, lunar_calendar, moon_ingresses, moon_aspects, _iso)
from ref_provider import RefProvider

P = RefProvider()
ts = lambda s: datetime.fromisoformat(s).timestamp()


def test_new_moons_2026():
    got = [_iso(x) for x in new_moons(P, ts('2026-10-01T00:00+00:00'), ts('2026-12-31T00:00+00:00'))]
    # Published: 2026-10-10 15:50 UTC, 2026-11-09 07:02 UTC, 2026-12-09 00:52 UTC (tolerance 10 min for the low-precision ref)
    exp = ['2026-10-10T15:50', '2026-11-09T07:02', '2026-12-09T00:52']
    for g, e in zip(got, exp):
        assert abs(ts(g.replace('Z', '+00:00')) - ts(e + '+00:00')) < 600, (g, e)


def test_voc_matches_independent_publication():
    # Telegram channel of A. Bulatkina, 16/10: «Луна без курса с 00:55 до 15:56 по Москве»
    v = [x for x in void_of_course(P, ts('2026-10-15T12:00+00:00'), ts('2026-10-16T12:00+00:00'))]
    assert len(v) == 1
    msk = ZoneInfo('Europe/Moscow')
    s = datetime.fromtimestamp(v[0]['startTs'], msk)
    e = datetime.fromtimestamp(v[0]['endTs'], msk)
    assert (s.day, e.day) == (16, 16)
    assert abs((s.hour * 60 + s.minute) - (0 * 60 + 55)) <= 5, s
    assert abs((e.hour * 60 + e.minute) - (15 * 60 + 56)) <= 5, e
    assert v[0]['moonSign'] == 'Sagittarius' and v[0]['nextSign'] == 'Capricorn'


def test_voc_end_is_ingress_and_start_is_last_aspect():
    a, b = ts('2026-11-01T00:00+00:00'), ts('2026-12-01T00:00+00:00')
    ing = moon_ingresses(P, a - 4 * 86400, b + 4 * 86400)
    for v in void_of_course(P, a, b):
        assert any(abs(i['ts'] - v['endTs']) < 2 for i in ing)
        assert v['startTs'] < v['endTs']
        # no exact aspect after the VoC start inside the sign stay
        later = moon_aspects(P, v['startTs'] + 5, v['endTs'])
        assert later == [], later
        assert v['endTs'] - v['startTs'] < 2.6 * 86400


def test_lunar_day_at_noon_and_local_dates():
    msk = lunar_calendar(P, '2026-11-16', 5, 'Europe/Moscow', 55.7558, 37.6173)
    nums = [r['lunarDayAtNoon'] for r in msk['days']]
    assert nums == [7, 8, 9, 10, 11], nums
    # every day of a cycle increments by one except at a new moon
    cal = lunar_calendar(P, '2026-11-01', 40, 'Asia/Novokuznetsk', 55.3547, 86.0873)
    seq = [r['lunarDayAtNoon'] for r in cal['days']]
    for x, y in zip(seq, seq[1:]):
        assert y == x + 1 or y in (1, 2) or y == x + 2 or y == x, seq
    assert max(seq) <= 30


def test_voc_crossing_midnight_is_listed_on_both_local_dates():
    cal = lunar_calendar(P, '2026-11-17', 2, 'Europe/Moscow', 55.7558, 37.6173)
    d17, d18 = cal['days']
    assert d17['voidOfCourse'] and d18['voidOfCourse']
    assert d17['voidOfCourse'][0]['startTs'] == d18['voidOfCourse'][0]['startTs']


def test_same_interval_for_all_zones():
    a = lunar_calendar(P, '2026-11-20', 1, 'Europe/Moscow', 55.75, 37.62)['days'][0]['voidOfCourse']
    b = lunar_calendar(P, '2026-11-20', 1, 'Asia/Ho_Chi_Minh', 10.82, 106.63)['days'][0]['voidOfCourse']
    assert {v['startTs'] for v in a} & {v['startTs'] for v in b}


def test_dst_zone_day_bounds():
    # New York 2026-11-01 is a 25-hour day (DST ends); the calendar must still produce one row
    cal = lunar_calendar(P, '2026-10-31', 3, 'America/New_York', 40.71, -74.0)
    assert [r['day'] for r in cal['days']] == ['2026-10-31', '2026-11-01', '2026-11-02']
    assert all(r['lunarDayAtNoon'] for r in cal['days'])


def test_polar_location_does_not_invent_boundaries():
    cal = lunar_calendar(P, '2026-12-10', 10, 'Europe/Moscow', 69.0, 33.0)  # Murmansk region
    for r in cal['days']:
        for s in r['segments']:
            assert s['endTs'] > s['startTs']


def test_swiss_fixture_agrees_with_independent_reference():
    """Swiss Ephemeris output of the deployed candidate vs the independent low-precision reference (tolerance 12 min)."""
    import json, os
    fx = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'test', 'fixtures', 'lunar-swiss-msk-20261015.json')))
    cal = lunar_calendar(P, '2026-10-15', 45, 'Europe/Moscow', 55.7558, 37.6173)
    assert [d['lunarDayAtNoon'] for d in cal['days']] == fx['lunarDayAtNoon']
    ref = []
    for d in cal['days']:
        for v in d['voidOfCourse']:
            if v['startUtc'] not in [x[0] for x in ref]:
                ref.append([v['startUtc'], v['endUtc'], v['lastAspect']['body'], v['lastAspect']['aspect']])
    assert len(ref) == len(fx['voc'])
    for r, s in zip(ref, fx['voc']):
        assert r[2:] == s[2:], (r, s)
        for i in (0, 1):
            assert abs(ts(r[i].replace('Z', '+00:00')) - ts(s[i].replace('Z', '+00:00'))) < 12 * 60, (r, s)
    assert fx['lunarDayAtNoon'][4] == 9  # 19.10 — 9-е лунные сутки (как у А. Булаткиной)
