// Сверка ответов движка (захвачены с работающего сервиса) с независимым расчётом (Schlyter/Meeus + Placidus).
// Допуски: планеты 0.1°, Луна 0.15°, Плутон 0.2°, ASC/MC 0.1°, промежуточные куспиды Placidus 0.2°.
import { test, expect } from "bun:test";
import { eclipticLongitudes, anglesAndPlacidus, angleDiff } from "../tools/ref-ephemeris.mjs";
const fx = await Bun.file(new URL("./fixtures/engine-reference-20261117.json", import.meta.url)).json();
const tol = { Moon: 0.15, Pluto: 0.2 };
for (const c of fx.cases) {
  test("положения планет: " + c.id, () => {
    const ref = eclipticLongitudes(new Date(c.birth.at));
    const diffs = Object.fromEntries(Object.entries(c.natal).map(([p, v]) => [p, +angleDiff(v, ref[p]).toFixed(3)]));
    console.log("ENGINE_VS_REF " + c.id + " " + JSON.stringify(diffs));
    for (const [p, d] of Object.entries(diffs)) expect(d).toBeLessThan(tol[p] || 0.1);
  });
  if (c.cusps) test("дома Placidus, ASC, MC: " + c.id, () => {
    const ref = anglesAndPlacidus(new Date(c.birth.at), c.birth.lat, c.birth.lon);
    expect(angleDiff(ref.asc, c.asc)).toBeLessThan(0.1);
    expect(angleDiff(ref.mc, c.mc)).toBeLessThan(0.1);
    const d = c.cusps.map((v, i) => +angleDiff(v, ref.cusps[i]).toFixed(3));
    console.log("CUSPS_VS_REF " + c.id + " " + JSON.stringify(d));
    for (const x of d) expect(x).toBeLessThan(0.2);
  });
}
test("полярная широта: Placidus не определён — и движок, и эталон это фиксируют явно", () => {
  const p = fx.polar;
  const ref = anglesAndPlacidus(new Date(p.birth.at), p.birth.lat, p.birth.lon);
  expect(ref.cusps).toBe(null);
  expect(p.engineStatus).toBe(422);
});
