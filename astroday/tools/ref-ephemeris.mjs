// Independent reference for checking the astro engine (not used in production).
// Planet/Sun/Moon positions: P. Schlyter, "How to compute planetary positions" (elements of date, ~1-2 arcmin).
// Sidereal time & obliquity: J. Meeus, Astronomical Algorithms, ch. 12 & 22 (low-precision form).
// Houses: Placidus via iterated semi-arc division; Ascendant/MC by the standard formulae.
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const rev = (x) => ((x % 360) + 360) % 360;
const sind = (x) => Math.sin(x * D2R), cosd = (x) => Math.cos(x * D2R), tand = (x) => Math.tan(x * D2R);
const atan2d = (y, x) => Math.atan2(y, x) * R2D, asind = (x) => Math.asin(x) * R2D, atand = (x) => Math.atan(x) * R2D;
export function julianDay(date) { return date.getTime() / 86400000 + 2440587.5; }
function kepler(M, e) {
  let E = M + e * R2D * sind(M) * (1 + e * cosd(M));
  for (let i = 0; i < 30; i++) { const dE = (E - e * R2D * sind(E) - M) / (1 - e * cosd(E)); E -= dE; if (Math.abs(dE) < 1e-9) break; }
  return E;
}
function elements(body, d) {
  switch (body) {
    case "Sun": return { N: 0, i: 0, w: 282.9404 + 4.70935e-5 * d, a: 1, e: 0.016709 - 1.151e-9 * d, M: 356.047 + 0.9856002585 * d };
    case "Moon": return { N: 125.1228 - 0.0529538083 * d, i: 5.1454, w: 318.0634 + 0.1643573223 * d, a: 60.2666, e: 0.0549, M: 115.3654 + 13.0649929509 * d };
    case "Mercury": return { N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5e-8 * d, w: 29.1241 + 1.01444e-5 * d, a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: 168.6562 + 4.0923344368 * d };
    case "Venus": return { N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d, a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: 48.0052 + 1.6021302244 * d };
    case "Mars": return { N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d, a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: 18.6021 + 0.5240207766 * d };
    case "Jupiter": return { N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d, a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: 19.895 + 0.0830853001 * d };
    case "Saturn": return { N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d, a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: 316.967 + 0.0334442282 * d };
    case "Uranus": return { N: 74.0005 + 1.3978e-5 * d, i: 0.7733 + 1.9e-8 * d, w: 96.6612 + 3.0565e-5 * d, a: 19.18171 - 1.55e-8 * d, e: 0.047318 + 7.45e-9 * d, M: 142.5905 + 0.011725806 * d };
    case "Neptune": return { N: 131.7806 + 3.0173e-5 * d, i: 1.77 - 2.55e-7 * d, w: 272.8461 - 6.027e-6 * d, a: 30.05826 + 3.313e-8 * d, e: 0.008606 + 2.15e-9 * d, M: 260.2471 + 0.005995147 * d };
  }
}
function orbit(el) {
  const E = kepler(rev(el.M), el.e);
  const xv = el.a * (cosd(E) - el.e), yv = el.a * Math.sqrt(1 - el.e * el.e) * sind(E);
  const v = atan2d(yv, xv), r = Math.hypot(xv, yv);
  const x = r * (cosd(el.N) * cosd(v + el.w) - sind(el.N) * sind(v + el.w) * cosd(el.i));
  const y = r * (sind(el.N) * cosd(v + el.w) + cosd(el.N) * sind(v + el.w) * cosd(el.i));
  const z = r * sind(v + el.w) * sind(el.i);
  return { x, y, z, r, lon: rev(atan2d(y, x)), lat: atan2d(z, Math.hypot(x, y)) };
}
export function eclipticLongitudes(date) {
  const d = julianDay(date) - 2451543.5;
  const sunEl = elements("Sun", d), sun = orbit(sunEl);
  const out = { Sun: sun.lon };
  // Moon with main perturbations
  const mEl = elements("Moon", d), m = orbit(mEl);
  const Ms = rev(sunEl.M), Mm = rev(mEl.M), Ls = rev(sunEl.w + Ms), Lm = rev(mEl.N + mEl.w + Mm), D = Lm - Ls, F = Lm - mEl.N;
  out.Moon = rev(m.lon - 1.274 * sind(Mm - 2 * D) + 0.658 * sind(2 * D) - 0.186 * sind(Ms) - 0.059 * sind(2 * Mm - 2 * D) - 0.057 * sind(Mm - 2 * D + Ms) + 0.053 * sind(Mm + 2 * D) + 0.046 * sind(2 * D - Ms) + 0.041 * sind(Mm - Ms) - 0.035 * sind(D) - 0.031 * sind(Mm + Ms) - 0.015 * sind(2 * F - 2 * D) + 0.011 * sind(Mm - 4 * D));
  const sx = sun.r * cosd(sun.lon), sy = sun.r * sind(sun.lon);
  const Mj = rev(elements("Jupiter", d).M), Msat = rev(elements("Saturn", d).M), Mu = rev(elements("Uranus", d).M);
  for (const p of ["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]) {
    const o = orbit(elements(p, d));
    let lon = o.lon, lat = o.lat;
    if (p === "Jupiter") lon += -0.332 * sind(2 * Mj - 5 * Msat - 67.6) - 0.056 * sind(2 * Mj - 2 * Msat + 21) + 0.042 * sind(3 * Mj - 5 * Msat + 21) - 0.036 * sind(Mj - 2 * Msat) + 0.022 * cosd(Mj - Msat) + 0.023 * sind(2 * Mj - 3 * Msat + 52) - 0.016 * sind(Mj - 5 * Msat - 69);
    if (p === "Saturn") { lon += 0.812 * sind(2 * Mj - 5 * Msat - 67.6) - 0.229 * cosd(2 * Mj - 4 * Msat - 2) + 0.119 * sind(Mj - 2 * Msat - 3) + 0.046 * sind(2 * Mj - 6 * Msat - 69) + 0.014 * sind(Mj - 3 * Msat + 32); lat += -0.02 * cosd(2 * Mj - 4 * Msat - 2) + 0.018 * sind(2 * Mj - 6 * Msat - 49); }
    if (p === "Uranus") lon += 0.04 * sind(Msat - 2 * Mu + 6) + 0.035 * sind(Msat - 3 * Mu + 33) - 0.015 * sind(Mj - Mu + 20);
    const x = o.r * cosd(lon) * cosd(lat) + sx, y = o.r * sind(lon) * cosd(lat) + sy;
    out[p] = rev(atan2d(y, x));
  }
  // Pluto (Schlyter, valid ~1885–2099)
  const S = 50.03 + 0.033459652 * d, P = 238.95 + 0.003968789 * d;
  const lp = 238.9508 + 0.00400703 * d - 19.799 * sind(P) + 19.848 * cosd(P) + 0.897 * sind(2 * P) - 4.956 * cosd(2 * P) + 0.61 * sind(3 * P) + 1.211 * cosd(3 * P) - 0.341 * sind(4 * P) - 0.19 * cosd(4 * P) + 0.128 * sind(5 * P) - 0.034 * cosd(5 * P) - 0.038 * sind(6 * P) + 0.031 * cosd(6 * P) + 0.02 * sind(S - P) - 0.01 * cosd(S - P);
  const bp = -3.9082 - 5.453 * sind(P) - 14.975 * cosd(P) + 3.527 * sind(2 * P) + 1.673 * cosd(2 * P) - 1.051 * sind(3 * P) + 0.328 * cosd(3 * P) + 0.179 * sind(4 * P) - 0.292 * cosd(4 * P) + 0.019 * sind(5 * P) + 0.1 * cosd(5 * P) - 0.031 * sind(6 * P) - 0.026 * cosd(6 * P) + 0.011 * cosd(S - P);
  const rp = 40.72 + 6.68 * sind(P) + 6.9 * cosd(P) - 1.18 * sind(2 * P) - 0.03 * cosd(2 * P) + 0.15 * sind(3 * P) - 0.14 * cosd(3 * P);
  // Schlyter's Pluto series already includes precession (equinox of date).
  const prec = 0;
  const px = rp * cosd(lp) * cosd(bp) + sx, py = rp * sind(lp) * cosd(bp) + sy;
  out.Pluto = rev(atan2d(py, px) + prec);
  return out;
}
export function obliquity(date) { const T = (julianDay(date) - 2451545) / 36525; return 23.439291 - 0.0130042 * T; }
export function ramc(date, lonDeg) {
  const JD = julianDay(date), T = (JD - 2451545) / 36525;
  return rev(280.46061837 + 360.98564736629 * (JD - 2451545) + 0.000387933 * T * T - T * T * T / 38710000 + lonDeg);
}
export function anglesAndPlacidus(date, latDeg, lonDeg) {
  const eps = obliquity(date), R = ramc(date, lonDeg);
  const mc = rev(atan2d(sind(R), cosd(R) * cosd(eps)));
  const asc = rev(atan2d(cosd(R), -(sind(R) * cosd(eps) + tand(latDeg) * sind(eps))));
  const fromRA = (ra) => rev(atan2d(sind(ra), cosd(ra) * cosd(eps)));
  const cusp = (f, above) => {
    let lam = above ? rev(mc + 30 * (f === 1 / 3 ? 1 : 2)) : rev(mc + 180 + 30 * (f === 2 / 3 ? 1 : 2));
    for (let i = 0; i < 100; i++) {
      const dec = asind(sind(eps) * sind(lam));
      const x = tand(latDeg) * tand(dec);
      if (Math.abs(x) >= 1) return null; // circumpolar: Placidus undefined
      const ad = asind(x);
      const ra = above ? R + f * (90 + ad) : R + 180 - f * (90 - ad);
      const next = fromRA(ra);
      if (Math.abs(((next - lam + 540) % 360) - 180) < 1e-9) { lam = next; break; }
      lam = next;
    }
    return lam;
  };
  const c11 = cusp(1 / 3, true), c12 = cusp(2 / 3, true), c2 = cusp(2 / 3, false), c3 = cusp(1 / 3, false);
  if ([c11, c12, c2, c3].some((x) => x === null)) return { asc, mc, cusps: null, reason: "placidus_undefined_at_latitude" };
  const cusps = [asc, c2, c3, rev(mc + 180), rev(c11 + 180), rev(c12 + 180), rev(asc + 180), rev(c2 + 180), rev(c3 + 180), mc, c11, c12];
  return { asc, mc, cusps };
}
export function angleDiff(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }
