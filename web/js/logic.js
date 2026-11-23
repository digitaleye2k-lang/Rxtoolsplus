/* Rx Tools Max+ — pure calculation logic (no DOM). Shared by the app and the tests. */
(function (root) {
  'use strict';

  const WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE'];
  const numberToWords = (n) => (n >= 0 && n < WORDS.length && Number.isInteger(n) ? WORDS[n] : String(n));

  const round2 = (x) => Math.round(x * 100) / 100;
  const fmtMg = (x) => String(round2(x)).replace(/\.0+$/, '');

  // ---------- Dates ----------
  const parseDate = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d, 12); // midday avoids DST edge cases
  };
  const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };
  const fmtDate = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // ---------- Prednisolone ----------
  // tabletSet: 'half5' (5mg, half 5mg, 1mg — original behaviour), 'tab25' (5mg, 2.5mg, 1mg), 'no-half' (5mg, 1mg)
  function predTablets(dose, tabletSet = 'half5') {
    dose = round2(dose);
    if (!(dose >= 0)) return { ok: false, text: 'Invalid dose', counts: {} };
    if (dose === 0) return { ok: true, text: 'ZERO tablets', counts: {} };
    let d = dose;
    const n5 = Math.floor(round2(d / 5)); d = round2(d - n5 * 5);
    let n25 = 0;
    if (tabletSet !== 'no-half') {
      // Only use a 2.5mg (or half) if what's left can be made exactly with 1mg tablets.
      for (let k = Math.floor(round2(d / 2.5)); k >= 0; k--) {
        if (Number.isInteger(round2(d - k * 2.5))) { n25 = k; break; }
      }
      d = round2(d - n25 * 2.5);
    }
    const n1 = d;
    const ok = Number.isInteger(n1);
    const parts = [];
    if (n5) parts.push(`${numberToWords(n5)} x 5mg tablet${n5 > 1 ? 's' : ''}`);
    if (n25) parts.push(tabletSet === 'half5' ? 'HALF a 5mg tablet' : `${numberToWords(n25)} x 2.5mg tablet${n25 > 1 ? 's' : ''}`);
    if (n1 && ok) parts.push(`${numberToWords(n1)} x 1mg tablet${n1 > 1 ? 's' : ''}`);
    const counts = { '5mg': n5, '1mg': ok ? n1 : 0 };
    if (tabletSet === 'half5') counts['5mg (halves)'] = n25; else if (tabletSet === 'tab25') counts['2.5mg'] = n25;
    if (!ok) return { ok: false, text: `Cannot make ${fmtMg(dose)}mg with the selected tablets`, counts };
    return { ok: true, text: `${parts.join(' AND ')} (${fmtMg(dose)}mg)`, counts };
  }

  // Two-phase taper: reduce by stepA every daysA until reaching threshold, then stepB every daysB to zero.
  function predTaperSteps({ startDose, stepA, daysA, threshold, stepB, daysB }) {
    const steps = [];
    let dose = round2(startDose);
    threshold = threshold > 0 ? round2(threshold) : 0;
    if (!(dose > 0) || !(stepA > 0) || !(daysA > 0)) return steps;
    if (threshold > 0 && (!(stepB > 0) || !(daysB > 0))) return steps;
    while (dose > 0 && steps.length < 200) {
      const above = dose > threshold;
      steps.push({ dose, days: above ? daysA : daysB });
      let next = round2(dose - (above ? stepA : stepB));
      if (above && threshold > 0 && next < threshold) next = threshold;
      dose = Math.max(0, next);
    }
    return steps;
  }

  // Build a dated chart from steps [{dose, days}].
  function predChart(steps, startISO, tabletSet = 'half5') {
    let date = parseDate(startISO);
    const rows = [];
    const totals = {};
    let totalDays = 0;
    let ok = true;
    for (const s of steps) {
      const days = Math.max(1, Math.floor(s.days));
      const t = predTablets(s.dose, tabletSet);
      if (!t.ok) ok = false;
      const from = date, to = addDays(date, days - 1);
      rows.push({ dose: round2(s.dose), days, from: fmtDate(from), to: fmtDate(to), tablets: t.text, ok: t.ok });
      for (const [k, v] of Object.entries(t.counts)) if (v) totals[k] = (totals[k] || 0) + v * days;
      totalDays += days;
      date = addDays(date, days);
    }
    // 'halves' are counted as halves; convert to whole tablets needed
    if (totals['5mg (halves)']) {
      totals['5mg'] = (totals['5mg'] || 0) + Math.ceil(totals['5mg (halves)'] / 2);
      delete totals['5mg (halves)'];
    }
    return { rows, totals, totalDays, stopDate: fmtDate(date), ok };
  }

  // ---------- Sulfasalazine ----------
  // Standard titration with 500mg tablets: +1 tablet per interval, extra tablet goes to the evening dose.
  function sulfaSchedule({ targetDailyMg = 2000, tabletMg = 500, intervalDays = 7, startISO }) {
    const targetTabs = Math.round(targetDailyMg / tabletMg);
    const rows = [];
    let date = parseDate(startISO);
    for (let tabs = 1; tabs <= targetTabs && tabs <= 12; tabs++) {
      const evening = Math.ceil(tabs / 2);
      const morning = tabs - evening;
      const last = tabs === targetTabs;
      rows.push({
        step: tabs, morning, evening, dailyMg: tabs * tabletMg,
        from: fmtDate(date), to: last ? null : fmtDate(addDays(date, intervalDays - 1)), ongoing: last,
      });
      date = addDays(date, intervalDays);
    }
    return rows;
  }
  const sulfaDoseText = (morning, evening, tabletMg = 500) => {
    const t = (n) => `${numberToWords(n)} tablet${n > 1 ? 's' : ''}`;
    if (!morning) return `Take ${t(evening)} in the EVENING`;
    if (morning === evening) return `Take ${t(morning)} TWICE a day (MORNING and EVENING)`;
    return `Take ${t(morning)} in the MORNING and ${t(evening)} in the EVENING`;
  };

  // ---------- Eye drops ----------
  function eyeDropSupply({ dropsPerDay, duration, unit = 'days', eyes = 1, doseType = 'multi', dropsPerBottle = 100, expiryDays = 28 }) {
    const d = Number(dropsPerDay), n = Number(duration), e = Number(eyes) || 1;
    if (!(d > 0) || !(n > 0) || !Number.isFinite(n)) return null;
    const totalDays = unit === 'months' ? n * 30 : unit === 'weeks' ? n * 7 : n;
    const totalDrops = d * e * totalDays;
    if (doseType === 'multi') {
      const byDrops = Math.ceil(totalDrops / dropsPerBottle);
      const byExpiry = expiryDays > 0 ? Math.ceil(totalDays / expiryDays) : 0;
      return { totalDays, totalDrops, needed: Math.max(byDrops, byExpiry), byDrops, byExpiry, limitedBy: byExpiry > byDrops ? 'expiry' : 'volume' };
    }
    // single-dose units: one unit per application (covers both eyes), so units = applications
    return { totalDays, totalDrops, needed: d * totalDays, limitedBy: 'units' };
  }

  // Spread n doses across the waking window (default 08:00–22:00).
  function doseTimes(n, startHour = 8, endHour = 22) {
    if (n <= 0) return [];
    if (n === 1) return [`${String(startHour).padStart(2, '0')}:00`];
    const span = (endHour - startHour) * 60;
    const out = [];
    for (let i = 0; i < n; i++) {
      const m = Math.round(startHour * 60 + (span * i) / (n - 1));
      const r = Math.round(m / 15) * 15; // nearest quarter hour
      out.push(`${String(Math.floor(r / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`);
    }
    return out;
  }

  // ---------- Quantity / days supply ----------
  function qtyForDays({ perDose, timesPerDay, days }) {
    if (!(perDose > 0) || !(timesPerDay > 0) || !(days > 0)) return null;
    return round2(perDose * timesPerDay * days);
  }
  function daysFromQty({ qty, perDose, timesPerDay }) {
    if (!(qty > 0) || !(perDose > 0) || !(timesPerDay > 0)) return null;
    const perDay = perDose * timesPerDay;
    return { days: Math.floor(round2(qty / perDay)), leftover: round2(qty - Math.floor(round2(qty / perDay)) * perDay) };
  }
  function packsNeeded(qty, packSize) {
    if (!(qty > 0) || !(packSize > 0)) return null;
    const packs = Math.ceil(round2(qty / packSize));
    return { packs, total: packs * packSize, spare: round2(packs * packSize - qty), wholePacksOnly: Math.floor(round2(qty / packSize)), splitQty: round2(qty % packSize) };
  }

  // ---------- Liquids ----------
  // strength given as strengthMg in strengthMl (e.g. 250mg in 5mL)
  function liquidDose({ doseMg, strengthMg, strengthMl, timesPerDay, days, bottleMl }) {
    if (!(doseMg > 0) || !(strengthMg > 0) || !(strengthMl > 0)) return null;
    const mgPerMl = strengthMg / strengthMl;
    const ml = round2(doseMg / mgPerMl);
    const out = { mgPerMl: round2(mgPerMl), ml };
    if (timesPerDay > 0 && days > 0) {
      out.totalMl = round2(ml * timesPerDay * days);
      if (bottleMl > 0) out.bottles = Math.ceil(round2(out.totalMl / bottleMl));
    }
    return out;
  }

  // ---------- Weight-based dose ----------
  function weightDose({ weightKg, mgPerKg, maxMg }) {
    if (!(weightKg > 0) || !(mgPerKg > 0)) return null;
    const calc = round2(weightKg * mgPerKg);
    const capped = maxMg > 0 && calc > maxMg;
    return { calc, dose: capped ? round2(maxMg) : calc, capped };
  }

  // ---------- Renal function (Cockcroft–Gault, SCr in micromol/L) ----------
  function bodyWeights({ weightKg, heightCm, sex }) {
    const out = {};
    if (heightCm > 0) {
      const inchesOver5ft = heightCm / 2.54 - 60;
      out.ibw = round2((sex === 'F' ? 45.5 : 50) + 2.3 * inchesOver5ft);
      if (weightKg > 0) {
        out.bmi = round2(weightKg / Math.pow(heightCm / 100, 2));
        out.adjbw = round2(out.ibw + 0.4 * (weightKg - out.ibw));
      }
    }
    return out;
  }
  function crcl({ age, weightKg, scr, sex }) {
    if (!(age > 0) || !(weightKg > 0) || !(scr > 0) || age >= 140) return null;
    const f = sex === 'F' ? 1.04 : 1.23;
    return round2(((140 - age) * weightKg * f) / scr);
  }

  // ---------- Prescription validity ----------
  const addMonths = (date, n) => {
    const d = new Date(date); const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate();
    d.setDate(Math.min(day, last)); return d;
  };
  // type: 'cd234' (Sch 2, 3, 4 CDs: 28 days after the appropriate date) or 'standard' (POM / Sch 5: 6 months)
  function rxValidity({ appropriateISO, type, checkISO }) {
    const start = parseDate(appropriateISO);
    const last = type === 'cd234' ? addDays(start, 28) : addMonths(start, 6);
    const out = { lastDay: fmtDate(last), lastISO: isoDate(last) };
    if (checkISO) {
      const check = parseDate(checkISO);
      const dayMs = 86400000;
      out.notYet = check < start;
      out.valid = !out.notYet && check <= last;
      out.daysLeft = Math.round((last - check) / dayMs);
    }
    return out;
  }

  // ---------- Quantity in words (for CD prescriptions) ----------
  const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  function intToWords(n) {
    if (!Number.isInteger(n) || n < 0 || n > 999999) return null;
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + intToWords(n % 100) : '');
    const th = Math.floor(n / 1000), rest = n % 1000;
    return intToWords(th) + ' thousand' + (rest ? (rest < 100 ? ' and ' : ' ') + intToWords(rest) : '');
  }
  function quantityInWords(x) {
    const s = String(x).trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const [whole, frac] = s.split('.');
    const w = intToWords(parseInt(whole, 10));
    if (w == null) return null;
    if (!frac || /^0+$/.test(frac)) return w;
    return w + ' point ' + frac.split('').map((d) => ONES[+d]).join(' ');
  }

  // ---------- In-use / discard dates ----------
  // Discard date = opened + period. A '28 days' item opened on the 1st is discarded on the 29th.
  function discardDate({ openedISO, amount, unit }) {
    if (!(amount > 0)) return null;
    const d = parseDate(openedISO);
    const out = unit === 'months' ? addMonths(d, amount) : addDays(d, unit === 'weeks' ? amount * 7 : amount);
    return { date: fmtDate(out), iso: isoDate(out), weekday: out.toLocaleDateString('en-GB', { weekday: 'long' }) };
  }

  // ---------- Patch / dose change schedules ----------
  const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function changeSchedule({ startISO, mode, everyDays, weekdays, count = 10 }) {
    const out = [];
    let d = parseDate(startISO);
    if (mode === 'interval') {
      if (!(everyDays > 0)) return out;
      for (let i = 0; i < count; i++) { out.push({ date: fmtDate(d), weekday: WEEKDAYS[d.getDay()] }); d = addDays(d, everyDays); }
    } else {
      const set = new Set((weekdays || []).map(Number));
      if (!set.size) return out;
      for (let i = 0; out.length < count && i < 400; i++) {
        if (set.has(d.getDay())) out.push({ date: fmtDate(d), weekday: WEEKDAYS[d.getDay()] });
        d = addDays(d, 1);
      }
    }
    return out;
  }

  // ---------- Unit conversion ----------
  const MASS = { g: 1, mg: 1e-3, mcg: 1e-6, ng: 1e-9, kg: 1e3 };
  const VOL = { L: 1, mL: 1e-3 };
  function convertUnit(value, from, to) {
    const tbl = MASS[from] && MASS[to] ? MASS : VOL[from] && VOL[to] ? VOL : null;
    if (!tbl || !Number.isFinite(value)) return null;
    return Number((value * tbl[from] / tbl[to]).toPrecision(10));
  }
  // % w/v → mg/mL (1% w/v = 1g in 100mL = 10mg/mL); ratio 1 in N (g in mL) → mg/mL
  const percentToMgMl = (pct) => round2(pct * 10);
  const ratioToMgMl = (n) => (n > 0 ? Number((1000 / n).toPrecision(6)) : null);

  // ---------- Short-dated stock ----------
  // expiry given as 'YYYY-MM' (use to end of that month) or 'YYYY-MM-DD'
  function shortDated({ expiry, supplyDays, todayISO }) {
    if (!expiry || !(supplyDays >= 0)) return null;
    let exp;
    if (/^\d{4}-\d{2}$/.test(expiry)) { const [y, m] = expiry.split('-').map(Number); exp = new Date(y, m, 0, 12); }
    else exp = parseDate(expiry);
    const today = parseDate(todayISO);
    const courseEnd = addDays(today, Math.max(0, supplyDays - 1));
    const daysToExpiry = Math.round((exp - today) / 86400000);
    let status = 'ok';
    if (daysToExpiry < 0) status = 'expired';
    else if (exp < courseEnd) status = 'short';
    else if (daysToExpiry < 90) status = 'soon';
    return { status, expiry: fmtDate(exp), courseEnd: fmtDate(courseEnd), daysToExpiry, shortBy: status === 'short' ? Math.round((courseEnd - exp) / 86400000) : 0 };
  }

  // ---------- Directions translator ----------
  const FREQ = {
    od: 'ONCE a day', daily: 'ONCE a day', bd: 'TWICE a day', bid: 'TWICE a day', tds: 'THREE times a day', tid: 'THREE times a day',
    qds: 'FOUR times a day', qid: 'FOUR times a day', om: 'in the MORNING', mane: 'in the MORNING', on: 'at NIGHT', nocte: 'at NIGHT',
    q4h: 'every FOUR hours', q6h: 'every SIX hours', q8h: 'every EIGHT hours', q12h: 'every TWELVE hours', qqh: 'every FOUR hours',
    weekly: 'once a WEEK', stat: 'IMMEDIATELY',
  };
  const MODS = {
    prn: 'when required', ac: 'before food', pc: 'after food', cc: 'with food', mdu: 'as directed', ud: 'as directed',
    po: '', top: '', pr: '', sl: '', inh: '',
  };
  const ROUTE_FORM = { pr: 'suppository', sl: 'tablet', inh: 'puff' };
  const FORMS = {
    tablet: ['Take', 'tablet', 'tablets'], capsule: ['Take', 'capsule', 'capsules'], spoon: ['Take', '5mL spoonful', '5mL spoonfuls'],
    ml: ['Take', 'mL', 'mL'], sachet: ['Take', 'sachet', 'sachets'], puff: ['Inhale', 'puff', 'puffs'], drop: ['Instil', 'drop', 'drops'],
    spray: ['Use', 'spray', 'sprays'], suppository: ['Insert', 'suppository', 'suppositories'], patch: ['Apply', 'patch', 'patches'],
    cream: ['Apply', '', ''], unit: ['Inject', 'unit', 'units'],
  };
  const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4 };
  const SUBLINGUAL = 'under the tongue';
  function expandDirections(text, form = 'tablet') {
    const tokens = String(text).toLowerCase().replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean);
    let qty = null, freq = [], mods = [], unknown = [], route = null;
    for (let t of tokens) {
      if (qty == null && /^\d+(\.\d+)?$/.test(t)) { qty = parseFloat(t); continue; }
      if (qty == null && t in ROMAN) { qty = ROMAN[t]; continue; }
      if (qty == null && (t === 'half' || t === '½')) { qty = 0.5; continue; }
      if (/^(\d+)-(\d+)$/.test(t) && qty == null) { const [a, b] = t.split('-').map(Number); qty = [a, b]; continue; }
      if (t in FREQ) { freq.push(FREQ[t]); continue; }
      if (t in MODS) { if (t in ROUTE_FORM) route = t; if (t === 'sl') mods.push(SUBLINGUAL); else if (MODS[t]) mods.push(MODS[t]); continue; }
      if (['tab', 'tabs', 'cap', 'caps', 'x'].includes(t)) continue;
      unknown.push(t);
    }
    const f = FORMS[form] || FORMS.tablet;
    const word = (n) => (n === 0.5 ? 'HALF a' : numberToWords(n));
    let amount = '';
    if (Array.isArray(qty)) amount = `${numberToWords(qty[0])} or ${numberToWords(qty[1])} ${f[2]}`;
    else if (qty != null) amount = `${word(qty)} ${qty > 1 ? f[2] : f[1]}`;
    else if (form === 'cream') amount = '';
    const parts = [f[0], amount, ...freq, ...mods].filter(Boolean);
    let out = parts.join(' ').replace(/\s+/g, ' ').trim();
    if (form === 'cream' && !amount) out = out.replace(/^Apply/, 'Apply thinly');
    return { text: out + (out.endsWith('.') ? '' : '.'), unknown, route };
  }

  // ---------- Calculation practice ----------
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const between = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));
  const CALC_TYPES = {
    liquid: 'Oral liquid volume', tablets: 'Number of tablets', days: 'Days supply', percent: '% w/v', dilution: 'Dilutions (C1V1)',
    mgkg: 'mg/kg dosing', infusion: 'Infusion rate (mL/hr)', drip: 'Drip rate (drops/min)', units: 'Unit conversion', ratio: 'Ratio strengths',
  };
  function calcQuestion(type, rng = Math.random) {
    switch (type) {
      case 'liquid': {
        const [s, v] = pick(rng, [[125, 5], [250, 5], [100, 5], [200, 5], [40, 5], [50, 5], [120, 5], [10, 1]]);
        const mlAns = pick(rng, [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]);
        const dose = round2((s / v) * mlAns);
        return { type, q: `A prescription asks for ${fmtMg(dose)}mg of a ${s}mg/${v}mL oral suspension. What volume is needed per dose?`, answer: mlAns, unit: 'mL', working: `${fmtMg(dose)}mg ÷ (${s}mg ÷ ${v}mL) = ${fmtMg(dose)} ÷ ${round2(s / v)} = ${mlAns}mL` };
      }
      case 'tablets': {
        const strength = pick(rng, [2.5, 5, 10, 20, 25, 50, 100, 250, 500]);
        const n = pick(rng, [0.5, 1, 1.5, 2, 3, 4]);
        const dose = round2(strength * n);
        return { type, q: `The dose is ${fmtMg(dose)}mg and the tablets available are ${fmtMg(strength)}mg. How many tablets per dose?`, answer: n, unit: 'tablets', working: `${fmtMg(dose)} ÷ ${fmtMg(strength)} = ${n}` };
      }
      case 'days': {
        const per = pick(rng, [1, 2]), times = pick(rng, [1, 2, 3, 4]);
        const days = pick(rng, [7, 10, 14, 28, 30, 56]);
        const qty = per * times * days;
        return { type, q: `A patient is given ${qty} tablets and takes ${numberToWords(per)} ${per > 1 ? 'tablets' : 'tablet'} ${({ 1: 'ONCE', 2: 'TWICE', 3: 'THREE times', 4: 'FOUR times' })[times]} a day. How many days will the supply last?`, answer: days, unit: 'days', working: `${qty} ÷ (${per} × ${times}) = ${qty} ÷ ${per * times} = ${days} days` };
      }
      case 'percent': {
        const pct = pick(rng, [0.1, 0.25, 0.5, 1, 2, 5, 10]);
        const vol = pick(rng, [10, 20, 50, 100, 200, 500]);
        const mg = round2(pct * 10 * vol);
        return { type, q: `How many milligrams of drug are in ${vol}mL of a ${pct}% w/v solution?`, answer: mg, unit: 'mg', working: `${pct}% w/v = ${pct}g in 100mL = ${round2(pct * 10)}mg/mL. ${round2(pct * 10)} × ${vol} = ${mg}mg` };
      }
      case 'dilution': {
        const c1 = pick(rng, [5, 10, 20, 50, 100]);
        const ratio = pick(rng, [2, 4, 5, 10, 20]);
        const c2 = round2(c1 / ratio);
        const v2 = pick(rng, [100, 200, 250, 500, 1000]);
        const v1 = round2(v2 / ratio);
        return { type, q: `What volume of a ${c1}% stock solution is needed to make ${v2}mL of a ${c2}% solution?`, answer: v1, unit: 'mL', working: `C1V1 = C2V2 → V1 = (${c2} × ${v2}) ÷ ${c1} = ${v1}mL (then make up to ${v2}mL)` };
      }
      case 'mgkg': {
        const kg = between(rng, 8, 40), mgkg = pick(rng, [5, 7.5, 10, 15, 20]), split = pick(rng, [1, 2, 3, 4]);
        const daily = round2(kg * mgkg * split);
        const each = round2(daily / split);
        return { type, q: `A child weighs ${kg}kg. The dose is ${mgkg}mg/kg ${({ 1: 'ONCE', 2: 'TWICE', 3: 'THREE times', 4: 'FOUR times' })[split]} a day. What is the total daily dose?`, answer: daily, unit: 'mg', working: `${kg} × ${mgkg} = ${each}mg per dose × ${split} = ${daily}mg a day` };
      }
      case 'infusion': {
        const vol = pick(rng, [100, 250, 500, 1000]), hrs = pick(rng, [1, 2, 4, 5, 8, 10]);
        const rate = round2(vol / hrs);
        return { type, q: `${vol}mL is to be infused over ${hrs} hour${hrs > 1 ? 's' : ''}. What is the rate in mL/hour?`, answer: rate, unit: 'mL/hr', working: `${vol} ÷ ${hrs} = ${rate}mL/hr` };
      }
      case 'drip': {
        const vol = pick(rng, [500, 1000]), hrs = pick(rng, [4, 5, 8, 10]), dpm = pick(rng, [15, 20]);
        const ans = round2((vol * dpm) / (hrs * 60));
        return { type, q: `${vol}mL is to run over ${hrs} hours with a giving set of ${dpm} drops/mL. What is the drip rate in drops/minute? (to 1 decimal place)`, answer: Math.round(ans * 10) / 10, unit: 'drops/min', working: `(${vol} × ${dpm}) ÷ (${hrs} × 60) = ${vol * dpm} ÷ ${hrs * 60} = ${Math.round(ans * 10) / 10}` };
      }
      case 'units': {
        const [v, from, to, f] = pick(rng, [[pick(rng, [0.125, 0.25, 0.5, 1.5]), 'mg', 'mcg', 1000], [pick(rng, [62.5, 125, 250, 500]), 'mcg', 'mg', 0.001], [pick(rng, [0.5, 1.2, 2.5]), 'g', 'mg', 1000], [pick(rng, [1.5, 2.25, 0.75]), 'L', 'mL', 1000]]);
        const ans = Number((v * f).toPrecision(10));
        return { type, q: `Convert ${v}${from} into ${to}.`, answer: ans, unit: to, working: `${v} × ${f} = ${ans}${to}` };
      }
      case 'ratio': {
        const n = pick(rng, [1000, 10000, 100000]), vol = pick(rng, [1, 5, 10, 20, 100]);
        const ans = Number(((1000 / n) * vol).toPrecision(6));
        return { type, q: `How many milligrams are in ${vol}mL of a 1 in ${n.toLocaleString('en-GB')} solution?`, answer: ans, unit: 'mg', working: `1 in ${n.toLocaleString('en-GB')} = 1g in ${n.toLocaleString('en-GB')}mL = ${Number((1000 / n).toPrecision(6))}mg/mL × ${vol} = ${ans}mg` };
      }
    }
    return null;
  }
  const checkAnswer = (given, answer) => Number.isFinite(given) && Math.abs(given - answer) <= Math.max(0.01, Math.abs(answer) * 0.01);

  const api = { shortDated, expandDirections, FORMS, calcQuestion, CALC_TYPES, checkAnswer, qtyForDays, daysFromQty, packsNeeded, liquidDose, weightDose, bodyWeights, crcl, rxValidity, addMonths, quantityInWords, intToWords, discardDate, changeSchedule, WEEKDAYS, convertUnit, percentToMgMl, ratioToMgMl, numberToWords, predTablets, predTaperSteps, predChart, sulfaSchedule, sulfaDoseText, eyeDropSupply, doseTimes, fmtDate, isoDate, parseDate, addDays, fmtMg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RxLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
