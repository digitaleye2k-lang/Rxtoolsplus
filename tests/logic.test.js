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

test('quantity and days supply', () => {
  assert.equal(L.qtyForDays({ perDose: 2, timesPerDay: 3, days: 7 }), 42);
  assert.deepEqual(L.daysFromQty({ qty: 100, perDose: 2, timesPerDay: 3 }), { days: 16, leftover: 4 });
  const p = L.packsNeeded(42, 28);
  assert.equal(p.packs, 2); assert.equal(p.spare, 14); assert.equal(p.splitQty, 14);
});

test('liquid dose 250mg/5mL', () => {
  const r = L.liquidDose({ doseMg: 125, strengthMg: 250, strengthMl: 5, timesPerDay: 3, days: 7, bottleMl: 100 });
  assert.equal(r.ml, 2.5); assert.equal(r.totalMl, 52.5); assert.equal(r.bottles, 1);
});

test('weight dose with cap', () => {
  assert.deepEqual(L.weightDose({ weightKg: 20, mgPerKg: 15, maxMg: 1000 }), { calc: 300, dose: 300, capped: false });
  assert.equal(L.weightDose({ weightKg: 80, mgPerKg: 15, maxMg: 1000 }).dose, 1000);
});

test('Cockcroft-Gault and body weights', () => {
  // 70y male 70kg SCr 100 → (70*70*1.23)/100 = 60.27
  assert.equal(L.crcl({ age: 70, weightKg: 70, scr: 100, sex: 'M' }), 60.27);
  assert.equal(L.crcl({ age: 70, weightKg: 70, scr: 100, sex: 'F' }), 50.96);
  const w = L.bodyWeights({ weightKg: 100, heightCm: 175, sex: 'M' });
  assert.equal(w.ibw, 70.46); assert.equal(w.bmi, 32.65);
});

test('prescription validity (CPE example: 1 Nov → 29 Nov)', () => {
  const cd = L.rxValidity({ appropriateISO: '2026-11-01', type: 'cd234', checkISO: '2026-11-29' });
  assert.equal(cd.lastDay, '29/11/2026'); assert.equal(cd.valid, true);
  assert.equal(L.rxValidity({ appropriateISO: '2026-11-01', type: 'cd234', checkISO: '2026-11-30' }).valid, false);
  assert.equal(L.rxValidity({ appropriateISO: '2026-11-05', type: 'cd234', checkISO: '2026-11-04' }).notYet, true);
  assert.equal(L.rxValidity({ appropriateISO: '2026-08-31', type: 'standard' }).lastDay, '28/02/2027');
});

test('quantity in words', () => {
  assert.equal(L.quantityInWords('56'), 'fifty-six');
  assert.equal(L.quantityInWords('100'), 'one hundred');
  assert.equal(L.quantityInWords('112'), 'one hundred and twelve');
  assert.equal(L.quantityInWords('1050'), 'one thousand and fifty');
  assert.equal(L.quantityInWords('2500'), 'two thousand five hundred');
  assert.equal(L.quantityInWords('7.5'), 'seven point five');
  assert.equal(L.quantityInWords('abc'), null);
});

test('discard dates and schedules', () => {
  assert.equal(L.discardDate({ openedISO: '2026-11-01', amount: 28, unit: 'days' }).date, '29/11/2026');
  assert.equal(L.discardDate({ openedISO: '2026-11-30', amount: 3, unit: 'months' }).date, '28/02/2027');
  const s = L.changeSchedule({ startISO: '2026-11-23', mode: 'interval', everyDays: 3, count: 3 });
  assert.deepEqual(s.map((x) => x.date), ['23/11/2026', '26/11/2026', '29/11/2026']);
  const w = L.changeSchedule({ startISO: '2026-11-23', mode: 'weekdays', weekdays: [1, 4], count: 3 });
  assert.deepEqual(w.map((x) => x.weekday), ['Monday', 'Thursday', 'Monday']);
});

test('unit conversions', () => {
  assert.equal(L.convertUnit(0.5, 'mg', 'mcg'), 500);
  assert.equal(L.convertUnit(1500, 'mL', 'L'), 1.5);
  assert.equal(L.convertUnit(1, 'mg', 'mL'), null);
  assert.equal(L.percentToMgMl(0.5), 5);
  assert.equal(L.ratioToMgMl(1000), 1);
});

test('short-dated check', () => {
  assert.equal(L.shortDated({ expiry: '2026-12', supplyDays: 28, todayISO: '2026-11-23' }).status, 'soon');
  const s = L.shortDated({ expiry: '2026-12', supplyDays: 56, todayISO: '2026-11-23' });
  assert.equal(s.status, 'short'); assert.equal(s.expiry, '31/12/2026');
  assert.equal(L.shortDated({ expiry: '2026-10', supplyDays: 7, todayISO: '2026-11-23' }).status, 'expired');
  assert.equal(L.shortDated({ expiry: '2028-01', supplyDays: 28, todayISO: '2026-11-23' }).status, 'ok');
});

test('directions translator', () => {
  assert.equal(L.expandDirections('1 tds').text, 'Take ONE tablet THREE times a day.');
  assert.equal(L.expandDirections('2 bd pc', 'capsule').text, 'Take TWO capsules TWICE a day after food.');
  assert.equal(L.expandDirections('1-2 qds prn').text, 'Take ONE or TWO tablets FOUR times a day when required.');
  assert.equal(L.expandDirections('ii puffs bd', 'puff').text, 'Inhale TWO puffs TWICE a day.');
  assert.equal(L.expandDirections('half om').text, 'Take HALF a tablet in the MORNING.');
  assert.equal(L.expandDirections('1 on', 'drop').text, 'Instil ONE drop at NIGHT.');
  assert.deepEqual(L.expandDirections('1 tds foo').unknown, ['foo']);
});

test('calculation questions: worked answers are self-consistent', () => {
  let seed = 1; const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (const type of Object.keys(L.CALC_TYPES)) {
    for (let i = 0; i < 200; i++) {
      const q = L.calcQuestion(type, rng);
      assert.ok(q && Number.isFinite(q.answer) && q.answer > 0, type);
      assert.ok(q.working.includes(String(q.answer)), `${type}: ${q.working} / ${q.answer}`);
      assert.ok(L.checkAnswer(q.answer, q.answer));
    }
  }
  // spot checks
  assert.ok(L.checkAnswer(2.5, 2.5)); assert.ok(!L.checkAnswer(2.6, 2.5)); assert.ok(L.checkAnswer(33.3, 33.33));
});
