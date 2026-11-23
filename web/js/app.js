/* Rx Tools Max+ — UI */
(function () {
  'use strict';
  const L = window.RxLogic;
  const APP_VERSION = '1.0.0';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => L.isoDate(new Date());

  // ---------- Storage (safe) ----------
  const store = {
    get(k, def) { try { const v = localStorage.getItem('rx.' + k); return v == null ? def : JSON.parse(v); } catch { return def; } },
    set(k, v) { try { localStorage.setItem('rx.' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- Toast / copy / print ----------
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2000);
  }
  async function copyText(text) {
    try {
      if (window.AndroidBridge && AndroidBridge.copy) { AndroidBridge.copy(text); toast('Copied'); return; }
      await navigator.clipboard.writeText(text); toast('Copied');
    } catch {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('Copied'); } catch { toast('Copy failed'); }
      ta.remove();
    }
  }
  function printHTML(html, jobName) {
    $('printArea').innerHTML = html;
    setTimeout(() => {
      if (window.AndroidBridge && AndroidBridge.print) AndroidBridge.print(jobName || 'Rx Tools');
      else window.print();
    }, 50);
  }
  const settings = () => store.get('settings', { pharmacy: '', address: '' });
  const footerHTML = () => {
    const s = settings();
    return s.pharmacy || s.address ? `<div class="footer">${esc(s.pharmacy)}${s.pharmacy && s.address ? ' — ' : ''}${esc(s.address)}</div>` : '';
  };
  const signaturesHTML = () => `<div class="signatures"><p>Pharmacist: ____________________</p><p>Date: ____________________</p></div>`;

  // ---------- Tabs ----------
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
    store.set('tab', b.dataset.tab);
    window.scrollTo(0, 0);
  }));
  const lastTab = store.get('tab', 'labels');
  const tabBtn = document.querySelector(`.tabs button[data-tab="${lastTab}"]`);
  if (tabBtn) tabBtn.click();

  // ---------- Settings ----------
  $('versionText').textContent = 'Version ' + APP_VERSION;
  $('settingsBtn').addEventListener('click', () => {
    const s = settings(); $('setPharmacy').value = s.pharmacy; $('setAddress').value = s.address;
    $('settingsDlg').showModal();
  });
  $('settingsDlg').addEventListener('close', () => store.set('settings', { pharmacy: $('setPharmacy').value.trim(), address: $('setAddress').value.trim() }));
  $('exportBtn').addEventListener('click', () => {
    const data = JSON.stringify(store.get('customLabels', []), null, 2);
    if (window.AndroidBridge && AndroidBridge.saveFile) { AndroidBridge.saveFile('rxtools-custom-labels.json', data); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'rxtools-custom-labels.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  $('importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const arr = JSON.parse(await f.text());
      if (!Array.isArray(arr)) throw new Error();
      const clean = arr.filter((x) => x && typeof x.name === 'string' && typeof x.instruction === 'string')
        .map((x) => ({ name: x.name.trim().toUpperCase(), instruction: x.instruction.trim() }));
      const cur = store.get('customLabels', []);
      for (const c of clean) { const i = cur.findIndex((x) => x.name === c.name); if (i >= 0) cur[i] = c; else cur.push(c); }
      store.set('customLabels', cur); renderLabelList(); toast(`Imported ${clean.length} label(s)`);
    } catch { toast('Not a valid labels file'); }
    e.target.value = '';
  });

  // ---------- Labels ----------
  let current = null; // {name, instruction, custom}
  function allLabels() {
    const custom = store.get('customLabels', []).map((x) => ({ ...x, custom: true }));
    const names = new Set(custom.map((c) => c.name));
    return [...custom, ...window.RX_MEDICATIONS.filter((m) => !names.has(m.name))].sort((a, b) => a.name.localeCompare(b.name));
  }
  function renderLabelList() {
    const q = $('labelSearch').value.trim().toLowerCase();
    const items = allLabels().filter((m) => !q || m.name.toLowerCase().includes(q) || m.instruction.toLowerCase().includes(q));
    $('labelList').innerHTML = items.length
      ? items.map((m, i) => `<button data-i="${i}"><b>${esc(m.name)}${m.custom ? '<span class="tag">CUSTOM</span>' : ''}</b><span>${esc(m.instruction)}</span></button>`).join('')
      : '<p class="hint" style="padding:12px">No matches.</p>';
    $('labelList').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => openLabel(items[+b.dataset.i])));
  }
  function openLabel(m) {
    current = m;
    $('labelEditor').hidden = false;
    $('labelTitle').textContent = m.name ? 'Label' : 'New custom label';
    $('lblName').value = m.name; $('lblText').value = m.instruction;
    if (!$('lblDate').value) $('lblDate').value = today();
    $('lblDelete').hidden = !m.custom;
    $('labelEditor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('labelSearch').addEventListener('input', renderLabelList);
  $('labelClose').addEventListener('click', () => { $('labelEditor').hidden = true; current = null; });
  $('lblNew').addEventListener('click', () => openLabel({ name: '', instruction: '', custom: false }));
  $('lblCopy').addEventListener('click', () => copyText($('lblText').value.trim()));
  $('lblSave').addEventListener('click', () => {
    const name = $('lblName').value.trim().toUpperCase(), instruction = $('lblText').value.trim();
    if (!name || !instruction) { toast('Enter a medicine and an instruction'); return; }
    const cur = store.get('customLabels', []);
    const i = cur.findIndex((x) => x.name === name);
    if (i >= 0) cur[i] = { name, instruction }; else cur.push({ name, instruction });
    store.set('customLabels', cur); renderLabelList();
    current = { name, instruction, custom: true }; $('lblDelete').hidden = false; toast('Saved');
  });
  $('lblDelete').addEventListener('click', () => {
    if (!current || !confirm(`Delete custom label "${current.name}"?`)) return;
    store.set('customLabels', store.get('customLabels', []).filter((x) => x.name !== current.name));
    renderLabelList(); $('labelEditor').hidden = true; toast('Deleted');
  });
  $('lblPrint').addEventListener('click', () => {
    const s = settings();
    const date = $('lblDate').value ? L.fmtDate(L.parseDate($('lblDate').value)) : '';
    const size = $('lblSize').value;
    printHTML(`<div class="print-label ${size === 'a4' ? 'a4' : ''}">
      <div class="med">${esc($('lblName').value)}${$('lblQty').value ? ' — ' + esc($('lblQty').value) : ''}</div>
      <div class="ins">${esc($('lblText').value).replace(/\n/g, '<br>')}</div>
      <div class="meta"><span>${esc($('lblPatient').value)}</span><span>${esc(date)}</span></div>
      <div class="meta"><span>Keep out of the reach and sight of children</span></div>
      ${s.pharmacy || s.address ? `<div class="ph">${esc(s.pharmacy)} ${esc(s.address)}</div>` : ''}
    </div>`, 'Label');
  });
  renderLabelList();

  // ---------- Prednisolone ----------
  let pSteps = [];
  $('pStart').value = today();
  function renderPredSteps() {
    const set = $('pSet').value;
    $('pStepsCard').hidden = false;
    $('pSteps').innerHTML = pSteps.map((s, i) => {
      const t = L.predTablets(s.dose, set);
      return `<div class="step" data-i="${i}">
        <label>Dose (mg)<input type="number" step="0.5" min="0" value="${s.dose}" data-k="dose" inputmode="decimal"></label>
        <label>Days<input type="number" min="1" value="${s.days}" data-k="days" inputmode="numeric"></label>
        <button class="btn small danger" data-del="${i}" aria-label="Remove step">✕</button>
        <div class="tabs-text ${t.ok ? '' : 'bad'}">${esc(t.text)}</div>
      </div>`;
    }).join('');
    $('pSteps').querySelectorAll('input').forEach((inp) => inp.addEventListener('change', (e) => {
      const i = +e.target.closest('.step').dataset.i;
      pSteps[i][e.target.dataset.k] = Math.max(e.target.dataset.k === 'days' ? 1 : 0, parseFloat(e.target.value) || 0);
      renderPredSteps();
    }));
    $('pSteps').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { pSteps.splice(+b.dataset.del, 1); renderPredSteps(); }));
    renderPredChart();
  }
  function predPrintHTML(chart, patient) {
    const lines = chart.rows.map((r) => `<p>Take <b>${esc(r.tablets)}</b> every MORNING from <b>${r.from}</b> to <b>${r.to}</b> (${r.days} day${r.days > 1 ? 's' : ''})</p>`).join('');
    const totals = Object.entries(chart.totals).map(([k, v]) => `${v} x ${k}`).join(', ');
    return `<div class="print-header"><div class="print-title">Prednisolone Reducing Chart</div>
      <div class="print-meta"><span>Patient: <b>${esc(patient) || '____________________'}</b></span><span>Printed: ${L.fmtDate(new Date())}</span></div></div>
      <p>Take your prednisolone tablets as a single dose in the MORNING with or after food, following the chart below.</p>
      ${lines}
      <p class="stop">STOP taking prednisolone on ${chart.stopDate}.</p>
      <p>Do not stop taking prednisolone suddenly unless told to by your doctor. Carry your steroid card.</p>
      <p>Take as directed by your doctor.</p>
      <div class="summary-box">Total course: ${chart.totalDays} days. Tablets required: ${esc(totals) || '—'}.</div>
      ${signaturesHTML()}${footerHTML()}`;
  }
  function renderPredChart() {
    const out = $('pOut');
    if (!pSteps.length) { out.hidden = true; return; }
    const chart = L.predChart(pSteps, $('pStart').value || today(), $('pSet').value);
    const totals = Object.entries(chart.totals).map(([k, v]) => `<b>${v}</b> x ${esc(k)}`).join(', ');
    const text = chart.rows.map((r) => `Take ${r.tablets} every MORNING from ${r.from} to ${r.to}`).join('\n') + `\nSTOP on ${chart.stopDate}.`;
    out.hidden = false;
    out.innerHTML = `<h2>Chart</h2>
      ${chart.ok ? '' : '<div class="warn">Some doses can’t be made with the selected tablets — adjust them before printing.</div>'}
      <table class="chart"><thead><tr><th>From</th><th>To</th><th>Dose</th><th>Tablets each morning</th></tr></thead><tbody>
      ${chart.rows.map((r) => `<tr><td>${r.from}</td><td>${r.to}</td><td>${L.fmtMg(r.dose)}mg</td><td>${esc(r.tablets.replace(/ \([\d.]+mg\)$/, ''))}</td></tr>`).join('')}
      <tr><td colspan="4"><b>STOP on ${chart.stopDate}</b></td></tr></tbody></table>
      <div class="summary">Total: <b>${chart.totalDays}</b> days. Tablets needed: ${totals || '—'}${$('pSet').value === 'half5' ? ' (halves rounded up to whole tablets)' : ''}.</div>
      <div class="actions"><button class="btn" id="pCopy">Copy text</button><button class="btn primary" id="pPrint">Print chart</button></div>`;
    $('pCopy').addEventListener('click', () => copyText(text));
    $('pPrint').addEventListener('click', () => {
      if (!chart.ok && !confirm('Some doses can’t be made with the selected tablets. Print anyway?')) return;
      printHTML(predPrintHTML(chart, $('pPatient').value.trim()), 'Prednisolone chart');
    });
  }
  $('pGen').addEventListener('click', () => {
    const v = (id) => parseFloat($(id).value);
    const thresh = v('pThresh') || 0;
    pSteps = L.predTaperSteps({ startDose: v('pDose'), stepA: v('pStepA'), daysA: v('pDaysA'), threshold: thresh, stepB: v('pStepB'), daysB: v('pDaysB') });
    if (!pSteps.length) { toast('Check the dose and reduction values'); return; }
    renderPredSteps();
    $('pStepsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('pAddStep').addEventListener('click', () => { const last = pSteps[pSteps.length - 1]; pSteps.push({ dose: last ? last.dose : 5, days: last ? last.days : 7 }); renderPredSteps(); });
  ['pSet', 'pStart'].forEach((id) => $(id).addEventListener('change', () => { if (pSteps.length) renderPredSteps(); }));

  // ---------- Sulfasalazine ----------
  $('sStart').value = today();
  $('sGen').addEventListener('click', () => {
    const tabletMg = +$('sTab').value;
    const rows = L.sulfaSchedule({ targetDailyMg: +$('sTarget').value, tabletMg, intervalDays: Math.max(1, parseInt($('sInterval').value) || 7), startISO: $('sStart').value || today() });
    const period = (r) => (r.ongoing ? `From ${r.from} onwards` : `${r.from} to ${r.to}`);
    const out = $('sOut'); out.hidden = false;
    out.innerHTML = `<h2>Chart</h2>
      <table class="chart"><thead><tr><th>Dates</th><th>Morning</th><th>Evening</th><th>Daily</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${period(r)}</td><td>${r.morning}</td><td>${r.evening}</td><td>${r.dailyMg}mg</td></tr>`).join('')}
      </tbody></table>
      <div class="actions"><button class="btn" id="sCopy">Copy text</button><button class="btn primary" id="sPrint">Print chart</button></div>`;
    const text = rows.map((r) => `${period(r)}: ${L.sulfaDoseText(r.morning, r.evening)} (${r.dailyMg}mg daily)`).join('\n');
    $('sCopy').addEventListener('click', () => copyText(text));
    $('sPrint').addEventListener('click', () => printHTML(`<div class="print-header"><div class="print-title">Sulfasalazine ${tabletMg}mg Dosing Chart</div>
      <div class="print-meta"><span>Patient: <b>${esc($('sPatient').value.trim()) || '____________________'}</b></span><span>Printed: ${L.fmtDate(new Date())}</span></div></div>
      <p>Swallow the tablets whole with water. Do not crush or chew.</p>
      <table><thead><tr><th>Dates</th><th>Morning</th><th>Evening</th><th>Total daily dose</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${period(r)}</td><td>${r.morning ? L.numberToWords(r.morning) + ' tablet' + (r.morning > 1 ? 's' : '') : '—'}</td><td>${L.numberToWords(r.evening)} tablet${r.evening > 1 ? 's' : ''}</td><td>${r.dailyMg}mg</td></tr>`).join('')}
      </tbody></table>
      <p class="stop">Then continue on ${rows[rows.length - 1].dailyMg}mg daily as directed.</p>
      <p>Take as directed by your doctor. Report any sore throat, fever, mouth ulcers, unexplained bruising or bleeding to your doctor straight away.</p>
      ${signaturesHTML()}${footerHTML()}`, 'Sulfasalazine chart'));
  });

  // ---------- Eye drops: supply ----------
  let doseType = 'multi';
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    doseType = b.dataset.dose;
    document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('active', x === b));
    $('eMultiOpts').hidden = doseType !== 'multi';
  }));
  $('eCalc').addEventListener('click', () => {
    $('eErr').hidden = true; $('eRes').hidden = true;
    const r = L.eyeDropSupply({ dropsPerDay: +$('eFreq').value, duration: +$('eDur').value, unit: $('eUnit').value, eyes: +$('eEyes').value,
      doseType, dropsPerBottle: Math.max(1, +$('eDpb').value || 100), expiryDays: Math.max(0, +$('eExp').value || 0) });
    if (!r) { $('eErr').textContent = 'Enter a valid duration.'; $('eErr').hidden = false; return; }
    const freq = $('eFreq').selectedOptions[0].textContent;
    const res = $('eRes'); res.hidden = false;
    res.innerHTML = doseType === 'multi'
      ? `<div class="big">${r.needed} bottle${r.needed > 1 ? 's' : ''}</div>
         <p>${esc(freq)}, ${$('eEyes').value === '2' ? 'both eyes' : 'one eye'}, ${r.totalDays} days → ${r.totalDrops} drops.</p>
         <p class="hint">By volume: ${r.byDrops} · By ${$('eExp').value}-day discard: ${r.byExpiry} — limited by <b>${r.limitedBy}</b>.</p>`
      : `<div class="big">${r.needed} unit${r.needed > 1 ? 's' : ''}</div>
         <p>${esc(freq)} for ${r.totalDays} days, one unit per application (${$('eEyes').value === '2' ? 'one unit can do both eyes' : 'one eye'}).</p>`;
  });

  // ---------- Eye drops: chart ----------
  let ecRows = [{ name: '', eye: 'BOTH eyes', freq: 4 }];
  const EYES = ['BOTH eyes', 'LEFT eye', 'RIGHT eye'];
  function renderEc() {
    $('ecRows').innerHTML = ecRows.map((r, i) => `<div class="ec-row" data-i="${i}">
      <label>Drop name<input data-k="name" value="${esc(r.name)}" placeholder="e.g. Chloramphenicol 0.5%"></label>
      <div class="grid3">
        <label>Eye<select data-k="eye">${EYES.map((e) => `<option${e === r.eye ? ' selected' : ''}>${e}</option>`).join('')}</select></label>
        <label>Times a day<input data-k="freq" type="number" min="1" max="16" value="${r.freq}" inputmode="numeric"></label>
        <button class="btn small danger" data-del="${i}" style="align-self:end;margin-bottom:10px">Remove</button>
      </div></div>`).join('');
    $('ecRows').querySelectorAll('input,select').forEach((el) => el.addEventListener('input', (e) => {
      const i = +e.target.closest('.ec-row').dataset.i, k = e.target.dataset.k;
      ecRows[i][k] = k === 'freq' ? Math.min(16, Math.max(1, parseInt(e.target.value) || 1)) : e.target.value;
    }));
    $('ecRows').querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { ecRows.splice(+b.dataset.del, 1); renderEc(); }));
  }
  $('ecAdd').addEventListener('click', () => { ecRows.push({ name: '', eye: 'BOTH eyes', freq: 4 }); renderEc(); });
  $('ecPrint').addEventListener('click', () => {
    const rows = ecRows.filter((r) => r.name.trim());
    if (!rows.length) { toast('Add at least one drop'); return; }
    // Collect all times, offset each additional drop by 5 minutes so they never share a slot.
    const slots = new Map();
    rows.forEach((r, idx) => L.doseTimes(r.freq).forEach((t) => {
      const [h, m] = t.split(':').map(Number); const mm = h * 60 + m + idx * 5;
      const key = `${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`;
      if (!slots.has(key)) slots.set(key, []); slots.get(key).push(r);
    }));
    const times = [...slots.keys()].sort();
    const days = 7;
    printHTML(`<div class="print-header"><div class="print-title">Eye Drop Chart</div>
      <div class="print-meta"><span>Patient: <b>${esc($('ecPatient').value.trim()) || '____________________'}</b></span><span>Printed: ${L.fmtDate(new Date())}</span></div></div>
      <p>${rows.map((r) => `<b>${esc(r.name)}</b>: ${L.numberToWords(r.freq)} time${r.freq > 1 ? 's' : ''} a day into ${r.eye === 'BOTH eyes' ? 'BOTH eyes' : 'the ' + esc(r.eye)}`).join('<br>')}</p>
      <table><thead><tr><th>Time</th><th>Drop</th>${Array.from({ length: days }, (_, i) => `<th class="tick">Day ${i + 1}</th>`).join('')}</tr></thead><tbody>
      ${times.map((t) => slots.get(t).map((r) => `<tr><td>${t}</td><td>${esc(r.name)} — ${esc(r.eye)}</td>${'<td></td>'.repeat(days)}</tr>`).join('')).join('')}
      </tbody></table>
      <p>Tick each box when the drop is used. Leave at least 5 minutes between different eye drops.</p>
      <p>Use as directed. Discard multi-dose bottles 28 days after opening unless the label says otherwise.</p>
      ${footerHTML()}`, 'Eye drop chart');
  });
  renderEc();

  // ---------- Offline (PWA) ----------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.AndroidBridge) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
