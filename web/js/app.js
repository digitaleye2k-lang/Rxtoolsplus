/* Rx Tools Max+ — UI */
(function () {
  'use strict';
  const L = window.RxLogic;
  const APP_VERSION = '1.1.0';
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

  // ---------- Tool registry & navigation ----------
  // roles: P = pharmacist, T = technician, A = assistant
  const TOOLS = [
    { id: 'labels', icon: '🏷', title: 'Label generator', desc: 'Search, edit and print label instructions', group: 'Dispensing', roles: 'PTA' },
    { id: 'qty', icon: '🔢', title: 'Quantity & days supply', desc: 'Quantity for a course, days a supply lasts, packs', group: 'Dispensing', roles: 'PTA' },
    { id: 'liquid', icon: '🧪', title: 'Liquid dose', desc: 'mg to mL, total volume and bottles', group: 'Dispensing', roles: 'PT' },
    { id: 'discard', icon: '📅', title: 'Discard date', desc: 'In-use expiry after opening or reconstituting', group: 'Dispensing', roles: 'PTA' },
    { id: 'owing', icon: '🧾', title: 'Owing slip', desc: 'Print an owing note for patient and pharmacy', group: 'Dispensing', roles: 'PTA' },
    { id: 'validity', icon: '✅', title: 'Prescription validity', desc: 'CD 28-day and 6-month expiry check', group: 'Checks', roles: 'PTA' },
    { id: 'words', icon: '✍', title: 'Quantity in words', desc: 'Figures to words for CD prescriptions', group: 'Checks', roles: 'PTA' },
    { id: 'weight', icon: '⚖', title: 'Weight-based dose', desc: 'mg/kg dose with maximum cap', group: 'Clinical', roles: 'PT' },
    { id: 'renal', icon: '🫘', title: 'Creatinine clearance', desc: 'Cockcroft–Gault with IBW, AdjBW and BMI', group: 'Clinical', roles: 'P' },
    { id: 'convert', icon: '🔁', title: 'Units & strengths', desc: 'mg/mcg/g, mL/L, % w/v and 1 in N', group: 'Clinical', roles: 'PT' },
    { id: 'pred', icon: '📉', title: 'Prednisolone chart', desc: 'Reducing dose chart with tablet breakdown', group: 'Charts', roles: 'PT' },
    { id: 'sulfa', icon: '📈', title: 'Sulfasalazine chart', desc: '500mg titration chart', group: 'Charts', roles: 'PT' },
    { id: 'eye', icon: '👁', title: 'Eye drops', desc: 'Bottle supply and printable drop chart', group: 'Charts', roles: 'PTA' },
    { id: 'schedule', icon: '🩹', title: 'Patch & change days', desc: 'List of patch or injection change dates', group: 'Charts', roles: 'PTA' },
  ];
  const GROUPS = ['Dispensing', 'Checks', 'Clinical', 'Charts'];
  let roleFilter = store.get('role', 'all');
  let currentTool = 'home';

  function renderHome() {
    const q = $('toolSearch').value.trim().toLowerCase();
    const favs = store.get('favs', []);
    const match = (t) => (roleFilter === 'all' || t.roles.includes(roleFilter)) && (!q || (t.title + ' ' + t.desc).toLowerCase().includes(q));
    const card = (t) => `<button class="tool" data-tool="${t.id}"><span class="ti">${t.icon}</span><span><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></span>${favs.includes(t.id) ? '<span class="star">★</span>' : ''}</button>`;
    let html = '';
    const favTools = TOOLS.filter((t) => favs.includes(t.id) && match(t));
    if (favTools.length && !q) html += `<h3 class="group">Favourites</h3><div class="tool-grid">${favTools.map(card).join('')}</div>`;
    for (const g of GROUPS) {
      const ts = TOOLS.filter((t) => t.group === g && match(t));
      if (ts.length) html += `<h3 class="group">${g}</h3><div class="tool-grid">${ts.map(card).join('')}</div>`;
    }
    $('toolGrid').innerHTML = html || '<p class="hint">No tools match.</p>';
    $('toolGrid').querySelectorAll('.tool').forEach((b) => b.addEventListener('click', () => openTool(b.dataset.tool)));
  }
  function showTool(id) {
    const t = TOOLS.find((x) => x.id === id);
    if (!t) id = 'home';
    currentTool = id;
    document.querySelectorAll('main > .panel').forEach((p) => p.classList.toggle('active', p.id === 'tool-' + id));
    $('backBtn').hidden = id === 'home';
    $('favBtn').hidden = id === 'home';
    $('pageTitle').textContent = t ? t.title : 'Rx Tools Max+';
    $('pageSub').textContent = t ? t.group : 'Pharmacy dispensing helpers';
    document.querySelector('.logo').hidden = id !== 'home';
    if (t) { const fav = store.get('favs', []).includes(id); $('favBtn').textContent = fav ? '★' : '☆'; $('favBtn').setAttribute('aria-label', fav ? 'Remove from favourites' : 'Add to favourites'); }
    if (id === 'home') renderHome();
    window.scrollTo(0, 0);
  }
  function openTool(id) {
    history.pushState({ tool: id }, '', '#' + id);
    showTool(id);
  }
  window.addEventListener('popstate', (e) => showTool((e.state && e.state.tool) || location.hash.slice(1) || 'home'));
  $('backBtn').addEventListener('click', () => { if (history.state && history.state.tool) history.back(); else { history.replaceState(null, '', '#'); showTool('home'); } });
  $('favBtn').addEventListener('click', () => {
    const favs = store.get('favs', []);
    const i = favs.indexOf(currentTool);
    if (i >= 0) favs.splice(i, 1); else favs.push(currentTool);
    store.set('favs', favs); showTool(currentTool); toast(i >= 0 ? 'Removed from favourites' : 'Added to favourites');
  });
  $('toolSearch').addEventListener('input', renderHome);
  document.querySelectorAll('#tool-home .chips button').forEach((b) => {
    b.classList.toggle('active', b.dataset.role === roleFilter);
    b.addEventListener('click', () => {
      roleFilter = b.dataset.role; store.set('role', roleFilter);
      document.querySelectorAll('#tool-home .chips button').forEach((x) => x.classList.toggle('active', x === b));
      renderHome();
    });
  });
  // Segmented controls: generic toggle helper
  function seg(id, onChange) {
    const btns = document.querySelectorAll(`#${id} button`);
    btns.forEach((b) => b.addEventListener('click', () => { btns.forEach((x) => x.classList.toggle('active', x === b)); onChange(b.dataset); }));
  }
  const num = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : NaN; };
  const fmt = (x) => (Math.round(x * 100) / 100).toLocaleString('en-GB');
  const show = (id, html) => { const el = $(id); el.hidden = !html; el.innerHTML = html || ''; };

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
      <div class="meta"><span></span><span>${esc(date)}</span></div>
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
  function predPrintHTML(chart) {
    const lines = chart.rows.map((r) => `<p>Take <b>${esc(r.tablets)}</b> every MORNING from <b>${r.from}</b> to <b>${r.to}</b> (${r.days} day${r.days > 1 ? 's' : ''})</p>`).join('');
    const totals = Object.entries(chart.totals).map(([k, v]) => `${v} x ${k}`).join(', ');
    return `<div class="print-header"><div class="print-title">Prednisolone Reducing Chart</div>
      <div class="print-meta"><span></span><span>Printed: ${L.fmtDate(new Date())}</span></div></div>
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
      printHTML(predPrintHTML(chart), 'Prednisolone chart');
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
      <div class="print-meta"><span></span><span>Printed: ${L.fmtDate(new Date())}</span></div></div>
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
  seg('eDose', (d) => { doseType = d.dose; $('eMultiOpts').hidden = doseType !== 'multi'; });
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
      <div class="print-meta"><span></span><span>Printed: ${L.fmtDate(new Date())}</span></div></div>
      <p>${rows.map((r) => `<b>${esc(r.name)}</b>: ${L.numberToWords(r.freq)} time${r.freq > 1 ? 's' : ''} a day into ${r.eye === 'BOTH eyes' ? 'BOTH eyes' : 'the ' + esc(r.eye)}`).join('<br>')}</p>
      <table><thead><tr><th>Time</th><th>Drop</th>${Array.from({ length: days }, (_, i) => `<th class="tick">Day ${i + 1}</th>`).join('')}</tr></thead><tbody>
      ${times.map((t) => slots.get(t).map((r) => `<tr><td>${t}</td><td>${esc(r.name)} — ${esc(r.eye)}</td>${'<td></td>'.repeat(days)}</tr>`).join('')).join('')}
      </tbody></table>
      <p>Tick each box when the drop is used. Leave at least 5 minutes between different eye drops.</p>
      <p>Use as directed. Discard multi-dose bottles 28 days after opening unless the label says otherwise.</p>
      ${footerHTML()}`, 'Eye drop chart');
  });
  renderEc();

  // ---------- Quantity & days ----------
  let qMode = 'qty';
  seg('qMode', (d) => { qMode = d.m; $('qDaysWrap').hidden = qMode !== 'qty'; $('qQtyWrap').hidden = qMode === 'qty'; calcQty(); });
  function calcQty() {
    const per = num('qPer'), times = num('qTimes'), pack = num('qPack');
    let html = '';
    if (qMode === 'qty') {
      const q = L.qtyForDays({ perDose: per, timesPerDay: times, days: num('qDays') });
      if (q != null) {
        html = `<div class="big">${fmt(q)}</div><p>${fmt(per)} × ${fmt(times)} a day × ${fmt(num('qDays'))} days</p>`;
        const p = L.packsNeeded(q, pack);
        if (p) html += `<p>${p.wholePacksOnly} full pack${p.wholePacksOnly === 1 ? '' : 's'} of ${fmt(pack)}${p.splitQty ? ` + <b>${fmt(p.splitQty)}</b> split` : ''} — or ${p.packs} pack${p.packs > 1 ? 's' : ''} (${fmt(p.spare)} spare).</p>`;
      }
    } else {
      const r = L.daysFromQty({ qty: num('qQty'), perDose: per, timesPerDay: times });
      if (r) {
        const end = L.addDays(new Date(), r.days);
        html = `<div class="big">${r.days} day${r.days === 1 ? '' : 's'}</div><p>Lasts until about ${L.fmtDate(L.addDays(end, -1))} if started today${r.leftover ? `, with ${fmt(r.leftover)} left over` : ''}.</p>`;
      }
    }
    show('qRes', html);
  }
  ['qPer', 'qTimes', 'qDays', 'qQty', 'qPack'].forEach((id) => $(id).addEventListener('input', calcQty));

  // ---------- Liquid dose ----------
  function calcLiquid() {
    const r = L.liquidDose({ doseMg: num('liDose'), strengthMg: num('liMg'), strengthMl: num('liMl'), timesPerDay: num('liTimes'), days: num('liDays'), bottleMl: num('liBottle') });
    if (!r) return show('liRes', '');
    let html = `<div class="big">${fmt(r.ml)} mL</div><p>per dose (strength ${fmt(r.mgPerMl)} mg/mL)</p>`;
    if (r.totalMl != null) html += `<p>Course: <b>${fmt(r.totalMl)} mL</b>${r.bottles ? ` → <b>${r.bottles}</b> bottle${r.bottles > 1 ? 's' : ''} of ${fmt(num('liBottle'))} mL` : ''}</p>`;
    if (r.ml < 1) html += '<p class="warn">Under 1 mL — check the oral syringe size and dose.</p>';
    show('liRes', html);
  }
  ['liDose', 'liMg', 'liMl', 'liTimes', 'liDays', 'liBottle'].forEach((id) => $(id).addEventListener('input', calcLiquid));

  // ---------- Weight dose ----------
  function calcWeight() {
    const r = L.weightDose({ weightKg: num('wKg'), mgPerKg: num('wMgKg'), maxMg: num('wMax') });
    if (!r) return show('wRes', '');
    let html = `<div class="big">${fmt(r.dose)} mg</div><p>${fmt(num('wKg'))} kg × ${fmt(num('wMgKg'))} mg/kg = ${fmt(r.calc)} mg</p>`;
    if (r.capped) html += `<p class="warn">Calculated dose is above the maximum — capped at ${fmt(r.dose)} mg.</p>`;
    const str = num('wStr');
    if (str > 0) html += `<p>= <b>${fmt(r.dose / (str / 5))} mL</b> of ${fmt(str)}mg/5mL</p>`;
    show('wRes', html);
  }
  ['wKg', 'wMgKg', 'wMax', 'wStr'].forEach((id) => $(id).addEventListener('input', calcWeight));

  // ---------- Renal ----------
  let rSex = 'M';
  seg('rSex', (d) => { rSex = d.s; calcRenal(); });
  function calcRenal() {
    const age = num('rAge'), scr = num('rScr'), kg = num('rKg'), cm = num('rCm');
    const actual = L.crcl({ age, weightKg: kg, scr, sex: rSex });
    if (actual == null) return show('rRes', '');
    const w = L.bodyWeights({ weightKg: kg, heightCm: cm, sex: rSex });
    let html = `<table class="chart"><thead><tr><th>Weight used</th><th>kg</th><th>CrCl (mL/min)</th></tr></thead><tbody>
      <tr><td>Actual</td><td>${fmt(kg)}</td><td><b>${fmt(actual)}</b></td></tr>`;
    if (w.ibw > 0) html += `<tr><td>Ideal (IBW)</td><td>${fmt(w.ibw)}</td><td><b>${fmt(L.crcl({ age, weightKg: w.ibw, scr, sex: rSex }))}</b></td></tr>`;
    if (w.adjbw > 0 && kg > w.ibw) html += `<tr><td>Adjusted (AdjBW)</td><td>${fmt(w.adjbw)}</td><td><b>${fmt(L.crcl({ age, weightKg: w.adjbw, scr, sex: rSex }))}</b></td></tr>`;
    html += '</tbody></table>';
    if (w.bmi) html += `<p>BMI ${fmt(w.bmi)}${w.bmi >= 30 ? ' — actual weight may overestimate CrCl.' : ''}${kg < w.ibw ? ' Actual weight is below IBW.' : ''}</p>`;
    if (age < 18) html += '<p class="warn">Cockcroft–Gault is for adults only.</p>';
    show('rRes', html);
  }
  ['rAge', 'rScr', 'rKg', 'rCm'].forEach((id) => $(id).addEventListener('input', calcRenal));

  // ---------- Units ----------
  function calcConvert() {
    const r = L.convertUnit(num('cVal'), $('cFrom').value, $('cTo').value);
    $('cRes').innerHTML = r == null ? '<p>Pick two mass units or two volume units.</p>'
      : `<div class="big">${r.toLocaleString('en-GB', { maximumSignificantDigits: 10 })} ${esc($('cTo').value)}</div>`;
    let s = '';
    const pct = num('cPct'), ratio = num('cRatio');
    if (pct > 0) s += `<p>${fmt(pct)}% w/v = <b>${fmt(L.percentToMgMl(pct))} mg/mL</b> (${fmt(pct)} g in 100 mL)</p>`;
    if (ratio > 0) s += `<p>1 in ${ratio.toLocaleString('en-GB')} = <b>${L.ratioToMgMl(ratio)} mg/mL</b></p>`;
    show('cStrRes', s);
  }
  ['cVal', 'cFrom', 'cTo', 'cPct', 'cRatio'].forEach((id) => $(id).addEventListener('input', calcConvert));
  calcConvert();

  // ---------- Quantity in words ----------
  function calcWords() {
    const w = L.quantityInWords($('wdNum').value);
    if (w == null) return show('wdRes', $('wdNum').value.trim() ? '<p>Enter a whole number or decimal (up to 999,999).</p>' : '');
    const unit = $('wdUnit').value.trim();
    const text = `${$('wdNum').value.trim()} (${w})${unit ? ' ' + unit : ''}`;
    show('wdRes', `<div class="big words">${esc(text)}</div><div class="actions"><button class="btn small" id="wdCopy">Copy</button></div>`);
    $('wdCopy').addEventListener('click', () => copyText(text));
  }
  ['wdNum', 'wdUnit'].forEach((id) => $(id).addEventListener('input', calcWords));

  // ---------- Rx validity ----------
  $('vDate').value = today(); $('vCheck').value = today();
  function calcValidity() {
    if (!$('vDate').value) return show('vRes', '');
    const r = L.rxValidity({ appropriateISO: $('vDate').value, type: $('vType').value, checkISO: $('vCheck').value || today() });
    let status;
    if (r.notYet) status = '<p class="bad-text">❌ Too early — cannot be supplied before the appropriate date.</p>';
    else if (r.valid) status = `<p class="ok-text">✅ Valid on the supply date — ${r.daysLeft === 0 ? 'last day today' : `${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} left`}.</p>`;
    else status = `<p class="bad-text">❌ Expired ${-r.daysLeft} day${r.daysLeft === -1 ? '' : 's'} before the supply date.</p>`;
    show('vRes', `<p>Last day it can be supplied:</p><div class="big">${r.lastDay}</div>${status}`);
  }
  ['vType', 'vDate', 'vCheck'].forEach((id) => $(id).addEventListener('input', calcValidity));
  calcValidity();

  // ---------- Discard date ----------
  $('dOpen').value = today();
  function calcDiscard() {
    const r = $('dOpen').value && L.discardDate({ openedISO: $('dOpen').value, amount: num('dAmt'), unit: $('dUnit').value });
    if (!r) return show('dRes', '');
    const text = `Opened ${L.fmtDate(L.parseDate($('dOpen').value))}. Discard on ${r.date}`;
    show('dRes', `<p>Discard on</p><div class="big">${r.date}</div><p>${r.weekday}</p><div class="actions"><button class="btn small" id="dCopy">Copy</button></div>`);
    $('dCopy').addEventListener('click', () => copyText(text));
  }
  ['dOpen', 'dAmt', 'dUnit'].forEach((id) => $(id).addEventListener('input', calcDiscard));
  document.querySelectorAll('#dPresets button').forEach((b) => b.addEventListener('click', () => { $('dAmt').value = b.dataset.a; $('dUnit').value = b.dataset.u; calcDiscard(); }));
  calcDiscard();

  // ---------- Change schedule ----------
  $('schStart').value = today();
  let schMode = 'interval';
  const schDays = new Set();
  $('schDays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((d) => `<button data-d="${d}">${L.WEEKDAYS[d].slice(0, 3)}</button>`).join('');
  document.querySelectorAll('#schDays button').forEach((b) => b.addEventListener('click', () => {
    const d = +b.dataset.d; if (schDays.has(d)) schDays.delete(d); else schDays.add(d);
    b.classList.toggle('active', schDays.has(d)); calcSchedule();
  }));
  seg('schMode', (d) => { schMode = d.m; $('schInterval').hidden = schMode !== 'interval'; $('schWeekdays').hidden = schMode === 'interval'; calcSchedule(); });
  document.querySelectorAll('#schPresets button').forEach((b) => b.addEventListener('click', () => { $('schEvery').value = b.dataset.d; calcSchedule(); }));
  function calcSchedule() {
    if (!$('schStart').value) return show('schRes', '');
    const rows = L.changeSchedule({ startISO: $('schStart').value, mode: schMode, everyDays: Math.floor(num('schEvery')), weekdays: [...schDays], count: Math.min(60, Math.max(1, Math.floor(num('schCount')) || 10)) });
    if (!rows.length) return show('schRes', '');
    const name = $('schName').value.trim();
    const table = (cls) => `<table class="${cls}"><thead><tr><th>#</th><th>Day</th><th>Date</th><th>Done</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.weekday}</td><td>${r.date}</td><td></td></tr>`).join('')}</tbody></table>`;
    show('schRes', `${table('chart')}<div class="actions"><button class="btn" id="schCopy">Copy</button><button class="btn primary" id="schPrint">Print</button></div>`);
    $('schCopy').addEventListener('click', () => copyText(rows.map((r) => `${r.weekday} ${r.date}`).join('\n')));
    $('schPrint').addEventListener('click', () => printHTML(`<div class="print-header"><div class="print-title">${esc(name) || 'Dose'} Change Dates</div>
      <div class="print-meta"><span>${schMode === 'interval' ? `Every ${num('schEvery')} days` : 'Every ' + [...schDays].sort().map((d) => L.WEEKDAYS[d]).join(' and ')}</span><span>Printed: ${L.fmtDate(new Date())}</span></div></div>
      ${table('')}<p>Remove the old patch before applying the new one, and use a different site each time, unless told otherwise.</p>${footerHTML()}`, 'Change dates'));
  }
  ['schName', 'schStart', 'schEvery', 'schCount'].forEach((id) => $(id).addEventListener('input', calcSchedule));
  calcSchedule();

  // ---------- Owing slip ----------
  $('owDate').value = today();
  function calcOwing() {
    const rx = num('owRx'), given = num('owGiven');
    $('owOwed').value = rx >= 0 && given >= 0 && rx >= given ? rx - given : '';
    if ($('owCd').checked) {
      const v = L.rxValidity({ appropriateISO: $('owDate').value || today(), type: 'cd234' });
      $('owCdNote').hidden = false;
      $('owCdNote').textContent = `CD owing must be supplied within 28 days of the prescription’s appropriate date. If that was today, the last day is ${v.lastDay}.`;
    } else $('owCdNote').hidden = true;
  }
  ['owRx', 'owGiven', 'owCd', 'owDate'].forEach((id) => $(id).addEventListener('input', calcOwing));
  $('owPrint').addEventListener('click', () => {
    if (!$('owItem').value.trim() || !$('owOwed').value) { toast('Enter the item and quantities'); return; }
    const date = L.fmtDate(L.parseDate($('owDate').value || today()));
    const slip = (who) => `<div class="owing"><div class="print-title">Owing Note — ${who} copy</div>
      <table><tbody>
      <tr><th>Date</th><td>${date}</td></tr>
      <tr><th>Item</th><td>${esc($('owItem').value)}</td></tr>
      <tr><th>Prescribed / supplied</th><td>${esc($('owRx').value)} / ${esc($('owGiven').value)}</td></tr>
      <tr><th>Owed</th><td><b>${esc($('owOwed').value)}</b></td></tr>
      <tr><th>Expected</th><td>${esc($('owWhen').value) || '&nbsp;'}</td></tr>
      <tr><th>Staff</th><td>${esc($('owStaff').value) || '&nbsp;'}</td></tr>
      ${$('owCd').checked ? '<tr><th>Note</th><td>Controlled drug — must be collected within 28 days of the prescription date.</td></tr>' : ''}
      </tbody></table><p>Please bring this note when you collect.</p>${footerHTML()}</div>`;
    printHTML(slip('Patient') + '<div class="cut">✂ - - - - - - - - - - - - - - - - - - - - - - - - - -</div>' + slip('Pharmacy'), 'Owing note');
  });

  // ---------- Start ----------
  const startTool = location.hash.slice(1);
  history.replaceState({ tool: null }, '', '#');
  showTool('home');
  if (startTool && TOOLS.some((t) => t.id === startTool)) openTool(startTool);

  // ---------- Offline (PWA) ----------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.AndroidBridge) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
