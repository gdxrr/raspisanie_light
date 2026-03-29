const { createApp, ref, computed, reactive, onMounted, onUnmounted, watch } = Vue;

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const DOW = { 'Понедельник': 1, 'Вторник': 2, 'Среда': 3, 'Четверг': 4, 'Пятница': 5, 'Суббота': 6, 'Воскресенье': 0 };
const MG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

const PAIR_TIMES = { '8:30': 0, '9:30': 1, '11:10': 2, '13:00': 3, '15:10': 4, '17:00': 5, '18:40': 6 };

function aWeek(d) {
  let y = d.getFullYear();
  if (d.getMonth() < 8) y--;
  const s = new Date(y, 8, 1), dw = s.getDay() || 7, m = new Date(s);
  m.setDate(s.getDate() - (dw - 1));
  return Math.floor((d - m) / 86400000 / 7) + 1;
}
function wt(d) { return aWeek(d) % 2 === 1 ? 'odd' : 'even'; }
function timeToMin(t) {
  const parts = String(t).split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}

function formatMinutesTotal(totalMin) {
  let t = Math.round(totalMin) % (24 * 60);
  if (t < 0) t += 24 * 60;
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function normalizeTime(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && !Number.isNaN(v)) {
    if (v < 0) return '';
    const frac = ((v % 1) + 1) % 1;
    return formatMinutesTotal(frac * 24 * 60);
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const hm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (hm) {
      const sec = hm[3] != null ? Number(hm[3]) : 0;
      return formatMinutesTotal(Number(hm[1]) * 60 + Number(hm[2]) + sec / 60);
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /^\d{4}-\d{2}-\d{2} /.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        if (y < 1910) {
          return formatMinutesTotal(d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60);
        }
        return formatMinutesTotal(d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60);
      }
    }
    const n = Number(s.replace(',', '.'));
    if (s !== '' && !Number.isNaN(n) && /^-?[\d.,]+$/.test(s)) return normalizeTime(n);
  }
  return String(v).trim();
}

function normalizeType(v) {
  const s = String(v || '').toLowerCase().trim();
  const map = {
    lec: 'lec', lecture: 'lec', лек: 'lec', лекция: 'lec',
    lab: 'lab', laboratory: 'lab', лаб: 'lab', 'лаб.': 'lab', 'лабораторная': 'lab',
    prac: 'prac', practice: 'prac', практика: 'prac', прак: 'prac',
    kurs: 'kurs', course: 'kurs', курсовая: 'kurs',
  };
  return map[s] || (['lec', 'lab', 'prac', 'kurs'].includes(s) ? s : '');
}

function normalizeWeek(v) {
  const s = String(v || '').toLowerCase().trim();
  if (['both', 'обе', 'все', 'любая', 'any'].includes(s)) return 'both';
  if (['odd', 'нечёт', 'нечет', 'нечётная', 'нечетная'].includes(s)) return 'odd';
  if (['even', 'чёт', 'чет', 'чётная', 'четная'].includes(s)) return 'even';
  return 'both';
}

function rowToLesson(row, sheetRowIndex) {
  if (!row || !row.length) return null;
  const idRaw = row[0];
  const day = String(row[1] ?? '').trim();
  const start = normalizeTime(row[2]);
  const end = normalizeTime(row[3]);
  const type = normalizeType(row[4]);
  const subject = String(row[5] ?? '').trim();
  const room = String(row[6] ?? '').trim();
  const teacher = String(row[7] ?? '').trim();
  const week = normalizeWeek(row[8]);
  if (!day || !start || !end || !type || !subject) return null;
  const idNum = Number(idRaw);
  const id = Number.isFinite(idNum) && idNum > 0 ? idNum : sheetRowIndex;
  return { id, day, start, end, type, subject, room, teacher, week };
}

function parseSheetValues(rows) {
  const out = [];
  if (!Array.isArray(rows)) return out;
  for (let i = 0; i < rows.length; i++) {
    const lesson = rowToLesson(rows[i], i + 2);
    if (lesson) out.push(lesson);
  }
  return out;
}

async function fetchRowsFromConfig(cfg) {
  const res = await fetch(cfg.webAppUrl);
  if (!res.ok) throw new Error('Web App: ' + res.status + ' ' + res.statusText);
  const j = await res.json();
  if (Array.isArray(j)) return j;
  if (j.values && Array.isArray(j.values)) return j.values;
  if (j.rows && Array.isArray(j.rows)) return j.rows;
  throw new Error('Web App: ожидался массив или { values: [...] }');
}

createApp({
  setup() {
    const today = new Date();

    const sch = ref([]);
    try {
      const s = localStorage.getItem('sch3');
      const d = s ? JSON.parse(s) : null;
      if (Array.isArray(d)) {
        sch.value = d.map((l) => ({
          ...l,
          start: normalizeTime(l.start),
          end: normalizeTime(l.end),
        }));
      }
    } catch (_) {}

    const settingsRaw = JSON.parse(localStorage.getItem('settings3') || '{}');
    const theme = ref(settingsRaw.theme || 'dark');
    const hasVUC = ref(settingsRaw.hasVUC !== undefined ? settingsRaw.hasVUC : true);
    const visSettings = reactive(settingsRaw.vis || {});

    const loading = ref(false);
    const loadError = ref('');
    const loadErrorStale = ref(false);

    function saveSettings() {
      localStorage.setItem('settings3', JSON.stringify({
        theme: theme.value,
        hasVUC: hasVUC.value,
        vis: { ...visSettings },
      }));
    }
    function setHasVUC(v) {
      hasVUC.value = v;
      saveSettings();
    }

    function applyTheme(t) {
      const el = document.documentElement;
      el.className = t === 'dark' ? '' : t;
      if (t === 'light') {
        el.style.background = '#f2f2f7';
        el.style.colorScheme = 'light';
      } else if (t === 'system') {
        el.style.background = '';
        el.style.colorScheme = 'light dark';
      } else if (t === 'glass') {
        el.style.background = '#12121c';
        el.style.colorScheme = 'dark';
      } else {
        el.style.background = '#1c1c1e';
        el.style.colorScheme = 'dark';
      }
    }
    applyTheme(theme.value);
    function setTheme(t) { theme.value = t; applyTheme(t); saveSettings(); }

    function visMode(id) { return visSettings[id] || 'show'; }
    function setVis(id, mode) { visSettings[id] = mode; saveSettings(); }
    function lessonShown(id) { return visMode(id) !== 'hide'; }

    function filterVUC(lessons) {
      if (hasVUC.value) return lessons;
      return lessons.filter(l => l.subject !== 'ВУЦ');
    }

    const vm = ref('list');
    const fil = ref('all');
    const cwt = computed(() => wt(today));
    const showSettings = ref(false);

    function tfl(t) { return { lec: 'Лекция', lab: 'Лабораторная работа', prac: 'Практика', kurs: 'Курсовая' }[t] || t; }
    function lucideIcon(name, size) {
      return window.LUCIDE_ICONS ? window.LUCIDE_ICONS.svg(name, size) : '';
    }
    function wLbl(w) { return { both: 'Обе', odd: 'Нечётная', even: 'Чётная' }[w] || w; }
    function pN(s) { const n = PAIR_TIMES[s]; return n != null ? (n === 0 ? '' : String(n)) : ''; }
    function wm(l, w) { return l.week === 'both' || l.week === w; }

    function ndDate(dn) {
      const t = DOW[dn], d = new Date(today), diff = (t - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      return d;
    }

    function sortL(a) { return [...a].sort((x, y) => timeToMin(x.start) - timeToMin(y.start)); }

    function buildDays(src) {
      const days = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dow = date.getDay();
        const idx = dow === 0 ? 6 : dow - 1;
        const dayName = DAYS[idx];
        const dateStr = `${date.getDate()} ${MG[date.getMonth()]}`;
        const isToday = (i === 0);
        const dayWt = wt(date);

        const meta = getCellMeta(date);
        const isWeekend = !!meta && ['weekend', 'holiday', 'credit-week', 'session', 'practice', 'vacation'].includes(meta.cls);
        let weekendLabel = '';
        if (meta) {
          if (meta.cls === 'weekend') weekendLabel = 'weekend';
          else if (meta.cls === 'holiday') weekendLabel = meta.shortLabel || 'Праздник';
          else if (meta.shortLabel) weekendLabel = meta.shortLabel;
        }

        let lessons = [];
        if (!isWeekend) {
          lessons = sortL(filterVUC(src).filter(l => l.day === dayName && wm(l, dayWt)));
          if (meta && meta.preHoliday) lessons = lessons.filter(l => timeToMin(l.start) <= timeToMin('14:30'));
        }

        const isWeekStart = i === 0 || date.getDay() === 1;
        days.push({ name: dayName, dateStr, date, isToday, lessons, isWeekend, weekendLabel, weekType: dayWt, isWeekStart });
      }
      return days;
    }

    const fDays = computed(() => {
      const all = buildDays(sch.value).map((d) => ({
        ...d,
        visibleLessons: d.lessons.filter((l) => lessonShown(l.id)),
      }));
      if (fil.value === 'odd') return all.filter(d => d.weekType === 'odd');
      if (fil.value === 'even') return all.filter(d => d.weekType === 'even');
      return all;
    });

    const scheduleVisList = computed(() => sch.value.filter((l) => l.subject !== 'ВУЦ'));

    const calM = ref(new Date(today.getFullYear(), today.getMonth(), 1));
    const selD = ref(new Date(today));
    const mTitle = computed(() => {
      const m = calM.value, n = MN[m.getMonth()];
      return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + m.getFullYear();
    });
    function prevM() { const m = calM.value; calM.value = new Date(m.getFullYear(), m.getMonth() - 1, 1); }
    function nextM() { const m = calM.value; calM.value = new Date(m.getFullYear(), m.getMonth() + 1, 1); }

    const FIXED_HOLIDAYS = [
      [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8],
      [1, 23], [2, 8], [4, 1], [4, 9], [5, 12], [10, 4], [11, 31],
    ];
    const FIXED_HOLIDAY_LABELS = {
      '0,1': 'Новый год', '0,7': 'Рождество', '1,23': 'День защитника', '2,8': '8 марта',
      '4,1': '1 мая', '4,9': 'День Победы', '5,12': 'День России', '10,4': 'День народного единства',
    };
    const PRE_HOLIDAYS = [[1, 22], [2, 7], [4, 8], [5, 11], [10, 3]];
    const PRE_MAY_CUTOFF = [[3, 30], [4, 8]];
    const LAST_ACADEMIC_WEEK = 40;

    function isHoliday(d) { const m = d.getMonth(), dd = d.getDate(); return FIXED_HOLIDAYS.some(([mm, ddd]) => mm === m && ddd === dd); }
    function isPreHoliday(d) { const m = d.getMonth(), dd = d.getDate(); return PRE_HOLIDAYS.some(([mm, ddd]) => mm === m && ddd === dd); }
    function isPreMayCutoff(d) { const m = d.getMonth(), dd = d.getDate(); return PRE_MAY_CUTOFF.some(([mm, ddd]) => mm === m && ddd === dd); }
    function getHolidayLabel(d) { return FIXED_HOLIDAY_LABELS[d.getMonth() + ',' + d.getDate()] || ''; }
    function getPeriodAfterTeaching(d) {
      const m = d.getMonth(), dd = d.getDate();
      if (m === 5 && dd >= 1 && dd <= 7) return { short: 'Зач.нед', cls: 'credit-week' };
      if (m === 5 && dd >= 8) return { short: 'Сессия', cls: 'session' };
      if (m === 6 && dd <= 5) return { short: 'Сессия', cls: 'session' };
      if (m === 6 && dd >= 6 && dd <= 19) return { short: 'Практика', cls: 'practice' };
      if (m === 6 && dd >= 20) return { short: 'Каникулы', cls: 'vacation' };
      if (m === 7) return { short: 'Каникулы', cls: 'vacation' };
      return null;
    }
    function isSaturdayWeekend(d) {
      if (d.getDay() !== 6) return false;
      const wn = aWeek(d);
      if (wn < 1 || wn > LAST_ACADEMIC_WEEK) return true;
      return wt(d) === 'even';
    }
    function getCellMeta(d) {
      const dow = d.getDay(), period = getPeriodAfterTeaching(d), holiday = isHoliday(d);
      if (period) return { cls: period.cls, shortLabel: period.short, dots: [], preHoliday: false };
      if (holiday) { const lbl = getHolidayLabel(d); return { cls: 'holiday', shortLabel: lbl || 'Праздник', dots: [], preHoliday: false }; }
      if (dow === 0) return { cls: 'weekend', shortLabel: '', dots: [], preHoliday: false };
      if (dow === 6 && isSaturdayWeekend(d)) return { cls: 'weekend', shortLabel: '', dots: [], preHoliday: false };
      if (isPreHoliday(d)) return { cls: 'pre-holiday', shortLabel: 'Сокр.', dots: [], preHoliday: true };
      if (isPreMayCutoff(d)) return { cls: 'pre-holiday', shortLabel: 'до 14:30', dots: [], preHoliday: true };
      return null;
    }

    const calCells = computed(() => {
      const m = calM.value, f = new Date(m.getFullYear(), m.getMonth(), 1), l = new Date(m.getFullYear(), m.getMonth() + 1, 0);
      const off = f.getDay() === 0 ? 6 : f.getDay() - 1;
      const cs = [];
      for (let i = 0; i < off; i++) cs.push(null);
      for (let d = 1; d <= l.getDate(); d++) {
        const date = new Date(m.getFullYear(), m.getMonth(), d);
        const meta = getCellMeta(date);
        if (meta && ['weekend', 'holiday', 'credit-week', 'session', 'practice', 'vacation'].includes(meta.cls)) {
          cs.push({ day: d, date, cls: meta.cls, shortLabel: meta.shortLabel || '', dots: [] });
          continue;
        }
        const idx = date.getDay() === 0 ? 6 : date.getDay() - 1;
        let ls = filterVUC(sch.value.filter(x => x.day === DAYS[idx] && wm(x, wt(date))));
        if (meta && meta.preHoliday) ls = ls.filter(x => timeToMin(x.start) <= timeToMin('14:30'));
        ls = ls.filter((x) => lessonShown(x.id));
        cs.push({ day: d, date, cls: meta ? meta.cls : '', shortLabel: meta ? meta.shortLabel || '' : '', dots: [...new Set(ls.map(x => x.type))] });
      }
      while (cs.length % 7 !== 0) cs.push(null);
      return cs;
    });

    function isTd(d) { return sD(d, today); }
    function sD(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    function fmtD(d) { const i = d.getDay() === 0 ? 6 : d.getDay() - 1; return `${DAYS[i]}, ${d.getDate()} ${MG[d.getMonth()]}`; }

    const selL = computed(() => {
      if (!selD.value) return [];
      const date = selD.value, meta = getCellMeta(date);
      if (meta && ['weekend', 'holiday', 'credit-week', 'session', 'practice', 'vacation'].includes(meta.cls)) return [];
      const i = date.getDay() === 0 ? 6 : date.getDay() - 1;
      let ls = filterVUC(sch.value.filter(l => l.day === DAYS[i] && wm(l, wt(date))));
      if (meta && meta.preHoliday) ls = ls.filter(l => timeToMin(l.start) <= timeToMin('14:30'));
      ls = ls.filter((l) => lessonShown(l.id));
      return ls.sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
    });

    const selPeriod = computed(() => {
      if (!selD.value) return '';
      if (isHoliday(selD.value)) return getHolidayLabel(selD.value) || 'Праздник';
      const p = getPeriodAfterTeaching(selD.value);
      if (p) return p.short;
      if (isPreMayCutoff(selD.value)) return 'Предпраздничный · учёба до 14:30';
      if (isPreHoliday(selD.value)) return 'Предпраздничный · сокращённый день';
      return '';
    });

    async function loadSchedule() {
      const cfg = typeof window.SCHEDULE_CONFIG === 'object' && window.SCHEDULE_CONFIG ? window.SCHEDULE_CONFIG : {};
      loadError.value = '';
      loadErrorStale.value = false;
      if (!cfg.webAppUrl) {
        loadError.value = 'В config.js укажите webAppUrl.';
        return;
      }
      loading.value = true;
      try {
        const rows = await fetchRowsFromConfig(cfg);
        const lessons = parseSheetValues(rows);
        sch.value = lessons;
        localStorage.setItem('sch3', JSON.stringify(lessons));
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        if (sch.value.length) loadErrorStale.value = true;
        else loadError.value = msg;
      } finally {
        loading.value = false;
      }
    }

    onMounted(() => { loadSchedule(); });

    watch(showSettings, (open) => {
      document.documentElement.classList.toggle('settings-open', open);
    });
    onUnmounted(() => {
      document.documentElement.classList.remove('settings-open');
    });

    return {
      schedule: sch, scheduleVisList, vm, fil, cwt,
      tfl, wLbl, pN, visMode, setVis,
      fDays,
      showSettings, theme, setTheme, hasVUC, setHasVUC, saveSettings, visSettings,
      calM, mTitle, prevM, nextM, calCells, selD, isTd, sD, fmtD, selL, selPeriod,
      loading, loadError, loadErrorStale, loadSchedule, lucideIcon,
    };
  },
}).mount('#app');
