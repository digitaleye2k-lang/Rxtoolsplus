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

  const api = { numberToWords, predTablets, predTaperSteps, predChart, sulfaSchedule, sulfaDoseText, eyeDropSupply, doseTimes, fmtDate, isoDate, parseDate, addDays, fmtMg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RxLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
