/* ═══════════════════════════════════════════════════════════
   CalTrack — Per-day target logic
   ═══════════════════════════════════════════════════════════ */

// ── Storage helpers ──────────────────────────────────────────
const LS = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v)   => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const KEY_ENTRIES  = 'ct_entries';
const KEY_TARGETS  = 'ct_targets';
const KEY_DEFAULT  = 'ct_default';

function getEntries()  { return LS.get(KEY_ENTRIES, {}); }
function getTargets()  { return LS.get(KEY_TARGETS, {}); }
function getDefault()  { return LS.get(KEY_DEFAULT, { calMin:1800, calMax:2200, carbMin:180, carbMax:270 }); }

function saveEntries(d)  { LS.set(KEY_ENTRIES, d); }
function saveTargets(d)  { LS.set(KEY_TARGETS, d); }
function saveDefault(d)  { LS.set(KEY_DEFAULT, d); }

function getTargetForDate(dateStr) {
  const targets = getTargets();
  return targets[dateStr] || getDefault();
}

function setTargetForDate(dateStr, target) {
  const targets = getTargets();
  targets[dateStr] = target;
  saveTargets(targets);
}

function getEntriesForDate(dateStr) {
  return getEntries()[dateStr] || [];
}

function setEntriesForDate(dateStr, entries) {
  const all = getEntries();
  all[dateStr] = entries;
  saveEntries(all);
}

function totals(entries) {
  return entries.reduce((a, e) => ({ cal: a.cal + Number(e.cal), carb: a.carb + Number(e.carb) }), { cal: 0, carb: 0 });
}

function getStatus(value, min, max) {
  if (min == null || max == null || (min === 0 && max === 0)) return 'none';
  if (value >= min && value <= max) return 'green';
  if (value < min) return 'yellow';
  return 'red';
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDateDisplay(dateStr) {
  const [y,m,d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d).toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}

// ── App State ────────────────────────────────────────────────
let activeTab       = 'today';
let selectedDate    = todayStr();
let calViewYear     = new Date().getFullYear();
let calViewMonth    = new Date().getMonth();
let editingEntry    = null;

// ── DOM refs ─────────────────────────────────────────────────
const tabBtns       = document.querySelectorAll('.tab-btn');
const views         = document.querySelectorAll('.view');
const toastEl       = document.getElementById('toast');

const todayDateEl   = document.getElementById('today-date');
const calSummary    = document.getElementById('cal-summary');
const carbSummary   = document.getElementById('carb-summary');
const foodListEl    = document.getElementById('food-list');
const addFoodBtn    = document.getElementById('add-food-btn');

const calGrid       = document.getElementById('cal-grid');
const calMonthLbl   = document.getElementById('cal-month');
const calPrevBtn    = document.getElementById('cal-prev');
const calNextBtn    = document.getElementById('cal-next');

const defCalMin     = document.getElementById('def-cal-min');
const defCalMax     = document.getElementById('def-cal-max');
const defCarbMin    = document.getElementById('def-carb-min');
const defCarbMax    = document.getElementById('def-carb-max');
const saveDefaultBtn = document.getElementById('save-default');

const dayCalMin     = document.getElementById('day-cal-min');
const dayCalMax     = document.getElementById('day-cal-max');
const dayCarbMin    = document.getElementById('day-carb-min');
const dayCarbMax    = document.getElementById('day-carb-max');
const saveDayTarget = document.getElementById('save-day-target');
const selectedDateLbl = document.getElementById('selected-date-lbl');

const datePicker    = document.getElementById('date-picker');

const modalBackdrop = document.getElementById('modal-backdrop');
const modalTitle    = document.getElementById('modal-title');
const entryName     = document.getElementById('entry-name');
const entryCal      = document.getElementById('entry-cal');
const entryCarb     = document.getElementById('entry-carb');
const modalCancel   = document.getElementById('modal-cancel');
const modalSave     = document.getElementById('modal-save');

// ── Tab switching ─────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  views.forEach(v => v.style.display = v.id === `view-${tab}` ? 'block' : 'none');
  if (tab === 'today') renderTodayView();
  if (tab === 'calendar') renderCalendar();
  if (tab === 'settings') renderSettings();
}

tabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, duration = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ── Today / History View ──────────────────────────────────────
function renderTodayView() {
  const isToday = selectedDate === todayStr();
  selectedDateLbl.textContent = formatDateDisplay(selectedDate);
  datePicker.value = selectedDate;

  const t = getTargetForDate(selectedDate);
  dayCalMin.value  = t.calMin  ?? '';
  dayCalMax.value  = t.calMax  ?? '';
  dayCarbMin.value = t.carbMin ?? '';
  dayCarbMax.value = t.carbMax ?? '';

  const entries = getEntriesForDate(selectedDate);
  const tot = totals(entries);
  const calStatus  = getStatus(tot.cal,  t.calMin,  t.calMax);
  const carbStatus = getStatus(tot.carb, t.carbMin, t.carbMax);

  renderMeter(calSummary,  '🔥 Calories', tot.cal,  t.calMin,  t.calMax,  calStatus);
  renderMeter(carbSummary, '🌾 Carbs (g)', tot.carb, t.carbMin, t.carbMax, carbStatus);

  foodListEl.innerHTML = '';
  if (entries.length === 0) {
    foodListEl.innerHTML = '<p class="empty-state">No food logged for this day.<br>Tap <strong>+ Add Food</strong> to start.</p>';
  } else {
    entries.forEach(e => {
      const div = document.createElement('div');
      div.className = 'food-item';
      div.innerHTML = `
        <div class="food-item-info">
          <div class="food-item-name">${escHtml(e.name)}</div>
          <div class="food-item-macros">${e.cal} kcal &nbsp;·&nbsp; ${e.carb}g carbs</div>
        </div>
        <div class="food-item-actions">
          <button class="btn btn-sm btn-ghost" data-action="edit" data-id="${e.id}">✏️</button>
          <button class="btn btn-sm btn-danger" data-action="del" data-id="${e.id}">🗑</button>
        </div>`;
      foodListEl.appendChild(div);
    });
  }
}

function renderMeter(container, label, value, min, max, status) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const rangeText = (min || max) ? `Target: ${min ?? '?'}–${max ?? '?'}` : 'No target set';
  container.className = `meter-card status-${status}`;
  container.innerHTML = `
    <div class="meter-label">${label}</div>
    <div class="meter-value">${value}</div>
    <div class="meter-target">${rangeText}</div>
    <div class="meter-bar"><div class="meter-fill" style="width:${pct}%"></div></div>`;
}

datePicker.addEventListener('change', () => {
  if (datePicker.value) {
    selectedDate = datePicker.value;
    renderTodayView();
  }
});

foodListEl.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const entries = getEntriesForDate(selectedDate);
  if (btn.dataset.action === 'del') {
    setEntriesForDate(selectedDate, entries.filter(x => x.id !== id));
    showToast('Entry deleted');
    renderTodayView();
  } else if (btn.dataset.action === 'edit') {
    editingEntry = entries.find(x => x.id === id);
    openModal('edit');
  }
});

addFoodBtn.addEventListener('click', () => {
  editingEntry = null;
  openModal('add');
});

saveDayTarget.addEventListener('click', () => {
  const t = {
    calMin:  Number(dayCalMin.value)  || 0,
    calMax:  Number(dayCalMax.value)  || 0,
    carbMin: Number(dayCarbMin.value) || 0,
    carbMax: Number(dayCarbMax.value) || 0,
  };
  setTargetForDate(selectedDate, t);
  showToast('Target saved for ' + formatDateDisplay(selectedDate));
  renderTodayView();
});

// ── Modal ─────────────────────────────────────────────────────
function openModal(mode) {
  modalTitle.textContent = mode === 'edit' ? 'Edit Food Entry' : 'Add Food Entry';
  entryName.value = editingEntry?.name ?? '';
  entryCal.value  = editingEntry?.cal  ?? '';
  entryCarb.value = editingEntry?.carb ?? '';
  modalBackdrop.classList.add('open');
  entryName.focus();
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  editingEntry = null;
}

modalCancel.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });

modalSave.addEventListener('click', () => {
  const name = entryName.value.trim();
  const cal  = Number(entryCal.value);
  const carb = Number(entryCarb.value);
  if (!name || isNaN(cal) || isNaN(carb) || cal < 0 || carb < 0) {
    showToast('Please fill all fields correctly');
    return;
  }
  const entries = getEntriesForDate(selectedDate);
  if (editingEntry) {
    const idx = entries.findIndex(x => x.id === editingEntry.id);
    if (idx > -1) entries[idx] = { ...editingEntry, name, cal, carb };
  } else {
    entries.push({ id: uid(), name, cal, carb });
  }
  setEntriesForDate(selectedDate, entries);
  closeModal();
  showToast(editingEntry ? 'Entry updated ✓' : 'Food added ✓');
  renderTodayView();
});

[entryName, entryCal, entryCarb].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') modalSave.click(); });
});

// ── Calendar View ─────────────────────────────────────────────
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function renderCalendar() {
  calMonthLbl.textContent = `${MONTHS[calViewMonth]} ${calViewYear}`;

  const firstDay = new Date(calViewYear, calViewMonth, 1).getDay();
  const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
  const today = todayStr();
  const allEntries = getEntries();

  calGrid.innerHTML = '';

  DAYS.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-day-label';
    el.textContent = d;
    calGrid.appendChild(el);
  });

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-cell empty';
    calGrid.appendChild(el);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calViewYear}-${String(calViewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayEntries = allEntries[dateStr] || [];
    const tot = totals(dayEntries);
    const t = getTargetForDate(dateStr);
    const hasData = dayEntries.length > 0;

    const calStatus  = hasData ? getStatus(tot.cal,  t.calMin,  t.calMax)  : 'none';
    const carbStatus = hasData ? getStatus(tot.carb, t.carbMin, t.carbMax) : 'none';

    const colorClass = resolveCalCellColor(calStatus, carbStatus);

    const cell = document.createElement('div');
    cell.className = `cal-cell ${colorClass}${dateStr === today ? ' today' : ''}${dateStr === selectedDate ? ' selected' : ''}`;
    cell.dataset.date = dateStr;

    const statsHtml = hasData ? `
      <div class="cal-cell-stats">
        <div class="cal-cell-stat">🔥 ${tot.cal}</div>
        <div class="cal-cell-stat">🌾 ${tot.carb}g</div>
      </div>` : '';

    cell.innerHTML = `<div class="cal-cell-date">${day}</div>${statsHtml}`;
    cell.addEventListener('click', () => jumpToDate(dateStr));
    calGrid.appendChild(cell);
  }
}

function resolveCalCellColor(calStatus, carbStatus) {
  if (calStatus === 'none' && carbStatus === 'none') return '';
  if (calStatus === carbStatus) {
    if (calStatus === 'green')  return 'all-green';
    if (calStatus === 'yellow') return 'all-yellow';
    if (calStatus === 'red')    return 'all-red';
  }
  const statuses = new Set([calStatus, carbStatus].filter(s => s !== 'none'));
  if (statuses.has('red') && statuses.has('yellow')) return 'split-ry';
  if (statuses.has('red') && statuses.has('green'))  return 'split-gr';
  if (statuses.has('green') && statuses.has('yellow')) return 'split-gy';
  return '';
}

function jumpToDate(dateStr) {
  selectedDate = dateStr;
  switchTab('today');
}

calPrevBtn.addEventListener('click', () => {
  calViewMonth--;
  if (calViewMonth < 0) { calViewMonth = 11; calViewYear--; }
  renderCalendar();
});
calNextBtn.addEventListener('click', () => {
  calViewMonth++;
  if (calViewMonth > 11) { calViewMonth = 0; calViewYear++; }
  renderCalendar();
});

// ── Settings View ─────────────────────────────────────────────
function renderSettings() {
  const d = getDefault();
  defCalMin.value  = d.calMin  ?? '';
  defCalMax.value  = d.calMax  ?? '';
  defCarbMin.value = d.carbMin ?? '';
  defCarbMax.value = d.carbMax ?? '';
}

saveDefaultBtn.addEventListener('click', () => {
  const d = {
    calMin:  Number(defCalMin.value)  || 0,
    calMax:  Number(defCalMax.value)  || 0,
    carbMin: Number(defCarbMin.value) || 0,
    carbMax: Number(defCarbMax.value) || 0,
  };
  saveDefault(d);
  showToast('Default targets saved ✓');
});

// ── Utility ───────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Boot ──────────────────────────────────────────────────────
switchTab('today');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
    }
