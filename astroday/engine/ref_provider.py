"""Independent low-precision provider (test only; never used in production).

Port of tools/ref-ephemeris.mjs: P. Schlyter "How to compute planetary positions"
(elements of date, ~1-2 arcmin) + Meeus ch. 12 sidereal time.  Used to unit-test the
lunar algorithms without Swiss Ephemeris and as an independent cross-check of it.
"""
from math import sin, cos, atan2, sqrt, hypot, asin, radians as rad, degrees as deg


def rev(x):
    return x % 360.0


def sind(x):
    return sin(rad(x))


def cosd(x):
    return cos(rad(x))


def _el(body, d):
    E = {
        'Sun': (0, 0, 282.9404 + 4.70935e-5 * d, 1, 0.016709 - 1.151e-9 * d, 356.047 + 0.9856002585 * d),
        'Moon': (125.1228 - 0.0529538083 * d, 5.1454, 318.0634 + 0.1643573223 * d, 60.2666, 0.0549, 115.3654 + 13.0649929509 * d),
        'Mercury': (48.3313 + 3.24587e-5 * d, 7.0047 + 5e-8 * d, 29.1241 + 1.01444e-5 * d, 0.387098, 0.205635 + 5.59e-10 * d, 168.6562 + 4.0923344368 * d),
        'Venus': (76.6799 + 2.4659e-5 * d, 3.3946 + 2.75e-8 * d, 54.891 + 1.38374e-5 * d, 0.72333, 0.006773 - 1.302e-9 * d, 48.0052 + 1.6021302244 * d),
        'Mars': (49.5574 + 2.11081e-5 * d, 1.8497 - 1.78e-8 * d, 286.5016 + 2.92961e-5 * d, 1.523688, 0.093405 + 2.516e-9 * d, 18.6021 + 0.5240207766 * d),
        'Jupiter': (100.4542 + 2.76854e-5 * d, 1.303 - 1.557e-7 * d, 273.8777 + 1.64505e-5 * d, 5.20256, 0.048498 + 4.469e-9 * d, 19.895 + 0.0830853001 * d),
        'Saturn': (113.6634 + 2.3898e-5 * d, 2.4886 - 1.081e-7 * d, 339.3939 + 2.97661e-5 * d, 9.55475, 0.055546 - 9.499e-9 * d, 316.967 + 0.0334442282 * d),
        'Uranus': (74.0005 + 1.3978e-5 * d, 0.7733 + 1.9e-8 * d, 96.6612 + 3.0565e-5 * d, 19.18171 - 1.55e-8 * d, 0.047318 + 7.45e-9 * d, 142.5905 + 0.011725806 * d),
        'Neptune': (131.7806 + 3.0173e-5 * d, 1.77 - 2.55e-7 * d, 272.8461 - 6.027e-6 * d, 30.05826 + 3.313e-8 * d, 0.008606 + 2.15e-9 * d, 260.2471 + 0.005995147 * d),
    }[body]
    return dict(N=E[0], i=E[1], w=E[2], a=E[3], e=E[4], M=E[5])


def _kepler(M, e):
    E = M + e * deg(1) * sind(M) * (1 + e * cosd(M))
    for _ in range(30):
        dE = (E - e * deg(1) * sind(E) - M) / (1 - e * cosd(E))
        E -= dE
        if abs(dE) < 1e-9:
            break
    return E


def _orbit(el):
    E = _kepler(rev(el['M']), el['e'])
    xv = el['a'] * (cosd(E) - el['e'])
    yv = el['a'] * sqrt(1 - el['e'] ** 2) * sind(E)
    v = deg(atan2(yv, xv))
    r = hypot(xv, yv)
    N, w, i = el['N'], el['w'], el['i']
    x = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i))
    y = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i))
    z = r * sind(v + w) * sind(i)
    return dict(x=x, y=y, z=z, r=r, lon=rev(deg(atan2(y, x))), lat=deg(atan2(z, hypot(x, y))))


def _d(ts):
    return ts / 86400.0 + 2440587.5 - 2451543.5


def _moon(d):
    s = _el('Sun', d)
    m = _el('Moon', d)
    o = _orbit(m)
    Ms, Mm = rev(s['M']), rev(m['M'])
    Ls, Lm = rev(s['w'] + Ms), rev(m['N'] + m['w'] + Mm)
    D, F = Lm - Ls, Lm - m['N']
    lon = rev(o['lon'] - 1.274 * sind(Mm - 2 * D) + 0.658 * sind(2 * D) - 0.186 * sind(Ms) - 0.059 * sind(2 * Mm - 2 * D)
              - 0.057 * sind(Mm - 2 * D + Ms) + 0.053 * sind(Mm + 2 * D) + 0.046 * sind(2 * D - Ms) + 0.041 * sind(Mm - Ms)
              - 0.035 * sind(D) - 0.031 * sind(Mm + Ms) - 0.015 * sind(2 * F - 2 * D) + 0.011 * sind(Mm - 4 * D))
    lat = (o['lat'] - 0.173 * sind(F - 2 * D) - 0.055 * sind(Mm - F - 2 * D) - 0.046 * sind(Mm + F - 2 * D)
           + 0.033 * sind(F + 2 * D) + 0.017 * sind(2 * Mm + F))
    r = o['r'] - 0.58 * cosd(Mm - 2 * D) - 0.46 * cosd(2 * D)
    return lon, lat, r


class RefProvider:
    def ecl(self, body, ts):
        d = _d(ts)
        if body == 'Moon':
            return _moon(d)[0]
        sun = _orbit(_el('Sun', d))
        if body == 'Sun':
            return sun['lon']
        sx, sy = sun['r'] * cosd(sun['lon']), sun['r'] * sind(sun['lon'])
        if body == 'Pluto':
            S = 50.03 + 0.033459652 * d
            P = 238.95 + 0.003968789 * d
            lp = (238.9508 + 0.00400703 * d - 19.799 * sind(P) + 19.848 * cosd(P) + 0.897 * sind(2 * P) - 4.956 * cosd(2 * P)
                  + 0.61 * sind(3 * P) + 1.211 * cosd(3 * P) - 0.341 * sind(4 * P) - 0.19 * cosd(4 * P) + 0.128 * sind(5 * P)
                  - 0.034 * cosd(5 * P) - 0.038 * sind(6 * P) + 0.031 * cosd(6 * P) + 0.02 * sind(S - P) - 0.01 * cosd(S - P))
            bp = (-3.9082 - 5.453 * sind(P) - 14.975 * cosd(P) + 3.527 * sind(2 * P) + 1.673 * cosd(2 * P) - 1.051 * sind(3 * P)
                  + 0.328 * cosd(3 * P) + 0.179 * sind(4 * P) - 0.292 * cosd(4 * P) + 0.019 * sind(5 * P) + 0.1 * cosd(5 * P)
                  - 0.031 * sind(6 * P) - 0.026 * cosd(6 * P) + 0.011 * cosd(S - P))
            rp = 40.72 + 6.68 * sind(P) + 6.9 * cosd(P) - 1.18 * sind(2 * P) - 0.03 * cosd(2 * P) + 0.15 * sind(3 * P) - 0.14 * cosd(3 * P)
            px, py = rp * cosd(lp) * cosd(bp) + sx, rp * sind(lp) * cosd(bp) + sy
            return rev(deg(atan2(py, px)))
        o = _orbit(_el(body, d))
        lon, lat = o['lon'], o['lat']
        Mj, Msat, Mu = rev(_el('Jupiter', d)['M']), rev(_el('Saturn', d)['M']), rev(_el('Uranus', d)['M'])
        if body == 'Jupiter':
            lon += (-0.332 * sind(2 * Mj - 5 * Msat - 67.6) - 0.056 * sind(2 * Mj - 2 * Msat + 21) + 0.042 * sind(3 * Mj - 5 * Msat + 21)
                    - 0.036 * sind(Mj - 2 * Msat) + 0.022 * cosd(Mj - Msat) + 0.023 * sind(2 * Mj - 3 * Msat + 52) - 0.016 * sind(Mj - 5 * Msat - 69))
        if body == 'Saturn':
            lon += (0.812 * sind(2 * Mj - 5 * Msat - 67.6) - 0.229 * cosd(2 * Mj - 4 * Msat - 2) + 0.119 * sind(Mj - 2 * Msat - 3)
                    + 0.046 * sind(2 * Mj - 6 * Msat - 69) + 0.014 * sind(Mj - 3 * Msat + 32))
            lat += -0.02 * cosd(2 * Mj - 4 * Msat - 2) + 0.018 * sind(2 * Mj - 6 * Msat - 49)
        if body == 'Uranus':
            lon += 0.04 * sind(Msat - 2 * Mu + 6) + 0.035 * sind(Msat - 3 * Mu + 33) - 0.015 * sind(Mj - Mu + 20)
        x = o['r'] * cosd(lon) * cosd(lat) + sx
        y = o['r'] * sind(lon) * cosd(lat) + sy
        return rev(deg(atan2(y, x)))

    def equ(self, body, ts):
        assert body == 'Moon'
        d = _d(ts)
        lon, lat, r = _moon(d)
        T = (ts / 86400.0 + 2440587.5 - 2451545.0) / 36525
        eps = 23.439291 - 0.0130042 * T
        x = cosd(lon) * cosd(lat)
        y = sind(lon) * cosd(lat) * cosd(eps) - sind(lat) * sind(eps)
        z = sind(lon) * cosd(lat) * sind(eps) + sind(lat) * cosd(eps)
        return rev(deg(atan2(y, x))), deg(asin(z)), r

    def gast(self, ts):
        jd = ts / 86400.0 + 2440587.5
        T = (jd - 2451545.0) / 36525
        return rev(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T ** 3 / 38710000)
