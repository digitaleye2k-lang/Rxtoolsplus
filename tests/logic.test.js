// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../web/js/logic.js');

test('prednisolone tablet breakdown (halve 5mg)', () => {
  assert.equal(L.predTablets(40).text, 'EIGHT x 5mg tablets (40mg)');
  assert.equal(L.predTablets(7.5).text, 'ONE x 5mg tablet AND HALF a 5mg tablet (7.5mg)');
  assert.equal(L.predTablets(9).text, 'ONE x 5mg tablet AND FOUR x 1mg tablets (9mg)');
  assert.equal(L.predTablets(3.5).text, 'HALF a 5mg tablet AND ONE x 1mg tablet (3.5mg)');
  assert.equal(L.predTablets(1).text, 'ONE x 1mg tablet (1mg)');
  assert.equal(L.predTablets(0).text, 'ZERO tablets');
});

test('prednisolone: unmakeable doses are flagged, not rounded', () => {
  assert.equal(L.predTablets(0.5).ok, false);
  assert.equal(L.predTablets(2.5, 'no-half').ok, false);
  assert.equal(L.predTablets(2.5, 'tab25').text, 'ONE x 2.5mg tablet (2.5mg)');
});

test('two-phase taper 40 → 10 by 5 weekly, then 1 weekly', () => {
  const s = L.predTaperSteps({ startDose: 40, stepA: 5, daysA: 7, threshold: 10, stepB: 1, daysB: 7 });
  assert.deepEqual(s.map((x) => x.dose), [40, 35, 30, 25, 20, 15, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.ok(s.every((x) => x.days === 7));
});

test('taper clamps to threshold when the step would overshoot', () => {
  const s = L.predTaperSteps({ startDose: 30, stepA: 7.5, daysA: 5, threshold: 10, stepB: 2.5, daysB: 3 });
  assert.deepEqual(s.map((x) => x.dose), [30, 22.5, 15, 10, 7.5, 5, 2.5]);
  assert.deepEqual(s.map((x) => x.days), [5, 5, 5, 3, 3, 3, 3]);
});

test('single-rate taper with threshold 0', () => {
  const s = L.predTaperSteps({ startDose: 20, stepA: 5, daysA: 3, threshold: 0 });
  assert.deepEqual(s.map((x) => x.dose), [20, 15, 10, 5]);
});

test('chart dates and tablet totals', () => {
  const c = L.predChart([{ dose: 7.5, days: 3 }, { dose: 5, days: 2 }], '2026-12-30');
  assert.equal(c.rows[0].from, '30/12/2026'); assert.equal(c.rows[0].to, '01/01/2027');
  assert.equal(c.rows[1].from, '02/01/2027'); assert.equal(c.stopDate, '04/01/2027');
  // 3 days x (1 whole + 1 half) + 2 days x 1 whole = 5 whole + 3 halves (=2 tablets) = 7
  assert.deepEqual(c.totals, { '5mg': 7 });
  assert.equal(c.totalDays, 5);
});

test('sulfasalazine 2g titration', () => {
  const r = L.sulfaSchedule({ targetDailyMg: 2000, tabletMg: 500, intervalDays: 7, startISO: '2026-11-23' });
  assert.deepEqual(r.map((x) => [x.morning, x.evening]), [[0, 1], [1, 1], [1, 2], [2, 2]]);
  assert.equal(r[3].from, '14/12/2026'); assert.equal(r[3].ongoing, true);
  assert.equal(L.sulfaDoseText(1, 2), 'Take ONE tablet in the MORNING and TWO tablets in the EVENING');
});

test('eye drop supply', () => {
  // 4/day one eye 28 days = 112 drops → 2 bottles by volume
  assert.equal(L.eyeDropSupply({ dropsPerDay: 4, duration: 28 }).needed, 2);
  // 1/day 3 months → 90 drops, but 28-day discard → 4 bottles
  const r = L.eyeDropSupply({ dropsPerDay: 1, duration: 3, unit: 'months' });
  assert.equal(r.needed, 4); assert.equal(r.limitedBy, 'expiry');
  // both eyes doubles the drops
  assert.equal(L.eyeDropSupply({ dropsPerDay: 4, duration: 28, eyes: 2 }).totalDrops, 224);
  assert.equal(L.eyeDropSupply({ dropsPerDay: 2, duration: 14, doseType: 'single' }).needed, 28);
  assert.equal(L.eyeDropSupply({ dropsPerDay: 2, duration: 0 }), null);
});

test('dose times', () => {
  assert.deepEqual(L.doseTimes(4), ['08:00', '12:45', '17:15', '22:00']);
  assert.deepEqual(L.doseTimes(1), ['08:00']);
});
