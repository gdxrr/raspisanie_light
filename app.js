const { createApp, ref, computed, reactive, onMounted, onUnmounted, watch } = Vue;

const FETCH_TIMEOUT_MS = 20000;

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const MN = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

function monthGenitive(monthIndex) {
  const nominative = MN[monthIndex] || '';
  if (!nominative) return '';
  if (nominative.endsWith('ь') || nominative.endsWith('й')) return nominative.slice(0, -1) + 'я';
  return nominative + 'а';
}

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
  const s = String(v || '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'лекция') return 'lec';
  if (s === 'лабораторная работа') return 'lab';
  if (s === 'практика') return 'prac';
  if (s === 'курсовая работа') return 'kurs';
  return '';
}

function normalizeWeek(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || s === 'обе') return 'both';
  if (s === 'нечётная') return 'odd';
  if (s === 'чётная') return 'even';
  return 'both';
}

function getObjectField(obj, keys) {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return '';
}

function rowToLesson(row, sheetRowIndex) {
  if (!row) return null;
  const isArrayRow = Array.isArray(row);
  const hasArrayData = isArrayRow && row.length > 0;
  const hasObjectData = !isArrayRow && typeof row === 'object' && Object.keys(row).length > 0;
  if (!hasArrayData && !hasObjectData) return null;

  const idRaw = isArrayRow ? '' : getObjectField(row, ['id', 'ID', 'Id']);
  const dayRaw = isArrayRow ? row[0] : getObjectField(row, ['day', 'день']);
  const pairRaw = isArrayRow ? row[1] : getObjectField(row, ['pair', 'pairNum', 'номер пары', 'пара']);
  const startRaw = isArrayRow ? row[2] : getObjectField(row, ['start', 'startTime', 'начало']);
  const endRaw = isArrayRow ? row[3] : getObjectField(row, ['end', 'endTime', 'конец']);
  const typeRaw = isArrayRow ? row[4] : getObjectField(row, ['type', 'тип']);
  const subjectRaw = isArrayRow ? row[5] : getObjectField(row, ['subject', 'дисциплина', 'предмет']);
  const roomRaw = isArrayRow ? row[6] : getObjectField(row, ['room', 'аудитория', 'кабинет']);
  const roomSchemeUrlRaw = isArrayRow ? row[7] : getObjectField(row, ['roomSchemeUrl', 'roomPhotoUrl', 'схема', 'ссылка']);
  const teacherRaw = isArrayRow ? row[8] : getObjectField(row, ['teacher', 'преподаватель']);
  const weekRaw = isArrayRow ? row[9] : getObjectField(row, ['week', 'неделя']);

  const day = String(dayRaw ?? '').trim();
  let start = normalizeTime(startRaw);
  let end = normalizeTime(endRaw);
  let type = normalizeType(typeRaw);
  const subject = String(subjectRaw ?? '').trim();
  const room = String(roomRaw ?? '').trim();
  const roomSchemeUrl = String(roomSchemeUrlRaw ?? '').trim();
  const teacher = String(teacherRaw ?? '').trim();
  const week = normalizeWeek(weekRaw);

  const pairNum = Number(pairRaw) || null;
  if (!day || !start || !end || !type || !subject) return null;
  const idNum = Number(idRaw);
  const id = Number.isFinite(idNum) && idNum > 0 ? idNum : sheetRowIndex;
  return { id, day, start, end, type, subject, room, roomSchemeUrl, teacher, week, pairNum };
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

async function fetchRowsFromConfig(cfg, fetchOpts) {
  const res = await fetch(cfg.webAppUrl, fetchOpts || {});
  if (!res.ok) throw new Error('Web App: ' + res.status + ' ' + res.statusText);
  const j = await res.json();
  if (Array.isArray(j)) return j;
  if (j.values && Array.isArray(j.values)) return j.values;
  if (j.rows && Array.isArray(j.rows)) return j.rows;
  if (j.data && Array.isArray(j.data)) return j.data;
  if (j.data && j.data.rows && Array.isArray(j.data.rows)) return j.data.rows;
  if (j.data && j.data.values && Array.isArray(j.data.values)) return j.data.values;
  if (j.result && Array.isArray(j.result)) return j.result;
  throw new Error('Web App: ожидался массив или { values: [...] }');
}

createApp({
  setup() {
    const today = ref(new Date());

    function vibrate(ms) {
      if (navigator.vibrate) navigator.vibrate(ms || 10);
    }

    const sch = ref([]);
    let fetchedAt = '';
    try {
      const s = localStorage.getItem('sch3');
      const d = s ? JSON.parse(s) : null;
      if (d && Array.isArray(d.lessons)) {
        sch.value = d.lessons.map((l) => ({
          ...l,
          start: normalizeTime(l.start),
          end: normalizeTime(l.end),
        }));
        fetchedAt = d.fetchedAt || '';
      } else if (Array.isArray(d)) {
        sch.value = d.map((l) => ({
          ...l,
          start: normalizeTime(l.start),
          end: normalizeTime(l.end),
        }));
      }
    } catch (_) {}

    const settingsRaw = JSON.parse(localStorage.getItem('settings3') || '{}');
    const theme = ref(settingsRaw.theme || 'dark');
    const vucDay = ref(settingsRaw.vucDay || 'hide');
    const accentColor = ref(settingsRaw.accentColor || 'blue');
    const lessonColorScheme = ref(settingsRaw.lessonColorScheme || 'default');
    const glassBackground = ref(settingsRaw.glassBackground || 'aurora');
    const visSettings = reactive(settingsRaw.vis || {});

    const loading = ref(false);
    const loadError = ref('');
    const loadErrorStale = ref(false);

    let loadSeq = 0;
    let loadAbort = null;
    let loadTimeoutId = 0;

    function saveSettings() {
      localStorage.setItem('settings3', JSON.stringify({
        theme: theme.value,
        vucDay: vucDay.value,
        accentColor: accentColor.value,
        lessonColorScheme: lessonColorScheme.value,
        glassBackground: glassBackground.value,
        vis: { ...visSettings },
      }));
    }
    function setVucDay(v) {
      vucDay.value = v;
      saveSettings();
    }

    function lessonStableKey(l) {
      return JSON.stringify([l.day, l.start, l.end, l.subject, l.week]);
    }
    function visModeLesson(l) {
      const sk = lessonStableKey(l);
      if (visSettings[sk] !== undefined) return visSettings[sk];
      const idKey = String(l.id);
      if (visSettings[idKey] !== undefined) return visSettings[idKey];
      if (visSettings[l.id] !== undefined) return visSettings[l.id];
      return 'show';
    }
    function setVisLesson(l, mode) {
      const sk = lessonStableKey(l);
      visSettings[sk] = mode;
      const idKey = String(l.id);
      if (visSettings[idKey] !== undefined) delete visSettings[idKey];
      if (visSettings[l.id] !== undefined) delete visSettings[l.id];
      saveSettings();
    }
    function lessonShownLesson(l) {
      return visModeLesson(l) !== 'hide';
    }

    const glassBackgrounds = {
      aurora: { name: 'Аврора' },
      sunset: { name: 'Закат' },
      ocean: { name: 'Океан' },
      forest: { name: 'Лес' },
      rose: { name: 'Роза' },
      minimal: { name: 'Минимал' },
    };

    function applyGlassBackground(bg) {
      const el = document.documentElement;
      if (theme.value !== 'glass') return;

      Object.keys(glassBackgrounds).forEach(key => {
        el.classList.remove('glass-bg-' + key);
      });

      if (bg && glassBackgrounds[bg]) {
        el.classList.add('glass-bg-' + bg);
      }
    }

    function setGlassBackground(bg) {
      glassBackground.value = bg;
      applyGlassBackground(bg);
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
        applyGlassBackground(glassBackground.value);
      } else {
        el.style.background = '#1c1c1e';
        el.style.colorScheme = 'dark';
      }
      setTimeout(() => {
        applyAccentColor(accentColor.value);
        applyLessonColorScheme(lessonColorScheme.value);
      }, 0);
    }
    applyTheme(theme.value);
    function setTheme(t) { theme.value = t; applyTheme(t); saveSettings(); }

    const accentColors = {
      blue: { name: 'Синий', color: '#0a84ff', colorLight: '#007aff' },
      purple: { name: 'Фиолетовый', color: '#bf5af2', colorLight: '#af52de' },
      pink: { name: 'Розовый', color: '#ff375f', colorLight: '#ff2d55' },
      green: { name: 'Зелёный', color: '#32d74b', colorLight: '#34c759' },
      orange: { name: 'Оранжевый', color: '#ff9f0a', colorLight: '#ff9500' },
      red: { name: 'Красный', color: '#ff453a', colorLight: '#ff3b30' },
      teal: { name: 'Бирюзовый', color: '#64d2ff', colorLight: '#5ac8fa' },
    };

    const lessonColorSchemes = {
      default: {
        name: 'Классика',
        dark: { lec: '#bf5af2', lab: '#32aaff', prac: '#ff9f0a', kurs: '#ff375f' },
        light: { lec: '#9b59d4', lab: '#0a7aff', prac: '#c47a00', kurs: '#d63050' },
        glass: { lec: '#c77dff', lab: '#48cae4', prac: '#ffb703', kurs: '#ff6b9d' }
      },
      warm: {
        name: 'Тёплая',
        dark: { lec: '#ff6b6b', lab: '#ffa500', prac: '#ffd93d', kurs: '#ff4757' },
        light: { lec: '#ee5a6f', lab: '#ff8c00', prac: '#f4c430', kurs: '#ff3838' },
        glass: { lec: '#ff7979', lab: '#ffb347', prac: '#ffe066', kurs: '#ff5e6c' }
      },
      cool: {
        name: 'Холодная',
        dark: { lec: '#4ecdc4', lab: '#45b7d1', prac: '#96ceb4', kurs: '#5f27cd' },
        light: { lec: '#3bb5ad', lab: '#3498db', prac: '#7fb685', kurs: '#5f27cd' },
        glass: { lec: '#5eddd3', lab: '#56c5e0', prac: '#a8dcc0', kurs: '#7c3aed' }
      },
      pastel: {
        name: 'Пастель',
        dark: { lec: '#b4a7d6', lab: '#92c9e8', prac: '#f4c2c2', kurs: '#d4a5a5' },
        light: { lec: '#9b8fc4', lab: '#7ab8d9', prac: '#e0a8a8', kurs: '#c49393' },
        glass: { lec: '#c4b5e8', lab: '#a5d8f5', prac: '#ffd4d4', kurs: '#e6b8b8' }
      },
      neon: {
        name: 'Неон',
        dark: { lec: '#ff00ff', lab: '#00ffff', prac: '#ffff00', kurs: '#ff0080' },
        light: { lec: '#d400d4', lab: '#00d4d4', prac: '#d4d400', kurs: '#d40066' },
        glass: { lec: '#ff33ff', lab: '#33ffff', prac: '#ffff33', kurs: '#ff3399' }
      },
      forest: {
        name: 'Лес',
        dark: { lec: '#6a994e', lab: '#52b788', prac: '#a7c957', kurs: '#bc6c25' },
        light: { lec: '#588b3c', lab: '#40916c', prac: '#95b745', kurs: '#a35a1f' },
        glass: { lec: '#7db05f', lab: '#63c99a', prac: '#b9d769', kurs: '#ce7d2f' }
      }
    };

    function applyLessonColorScheme(schemeName) {
      const scheme = lessonColorSchemes[schemeName];
      if (!scheme) {
        return;
      }

      const root = document.documentElement;
      const currentTheme = theme.value;
      let colors;

      if (currentTheme === 'glass') {
        colors = scheme.glass;
      } else if (currentTheme === 'light') {
        colors = scheme.light;
      } else if (currentTheme === 'system') {
        const isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
        colors = isLight ? scheme.light : scheme.dark;
      } else {
        colors = scheme.dark;
      }

      root.style.setProperty('--lec', colors.lec, 'important');
      root.style.setProperty('--lab', colors.lab, 'important');
      root.style.setProperty('--prac', colors.prac, 'important');
      root.style.setProperty('--kurs', colors.kurs, 'important');
    }

    function setLessonColorScheme(schemeName) {
      lessonColorScheme.value = schemeName;
      applyLessonColorScheme(schemeName);
      saveSettings();
    }

    function applyAccentColor(color) {
      const colorData = accentColors[color];
      if (!colorData) return;
      const root = document.documentElement;
      const currentTheme = theme.value;
      let isLight = false;

      if (currentTheme === 'light') {
        isLight = true;
      } else if (currentTheme === 'system') {
        isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      }

      const accentValue = isLight ? colorData.colorLight : colorData.color;
      root.style.setProperty('--accent', accentValue);
    }

    function setAccentColor(color) {
      accentColor.value = color;
      applyAccentColor(color);
      saveSettings();
    }

    watch(theme, () => {
      applyAccentColor(accentColor.value);
      applyLessonColorScheme(lessonColorScheme.value);
    });

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      mediaQuery.addEventListener('change', () => {
        if (theme.value === 'system') {
          applyAccentColor(accentColor.value);
          applyLessonColorScheme(lessonColorScheme.value);
        }
      });
    }

    function filterVUC(lessons, forDay = null) {
      if (vucDay.value === 'hide') return lessons.filter(l => l.subject !== 'ВУЦ');
      const targetDay = vucDay.value === 'wed' ? 'Среда' : 'Четверг';
      const noVuc = lessons.filter(l => l.subject !== 'ВУЦ');

      if (forDay && forDay !== targetDay) {
        return noVuc;
      }

      const vucLessons = [
        { id: 'vuc-1', day: targetDay, start: '8:30', end: '17:30', type: 'lec', subject: 'ВУЦ', room: 'Б. Морская | ВУЦ', teacher: '', week: 'both' },
      ];
      return [...noVuc, ...vucLessons];
    }

    const vm = ref('list');
    const fil = ref('all');
    const showSettings = ref(false);
    const settingsTab = ref('schedule');
    const selectedLesson = ref(null);
    const calWrapRef = ref(null);

    function preloadRoomPhoto(room) {
      if (!room) return;
      const img = new Image();
      img.src = room;
    }

    function tfl(t) { return { lec: 'Лекция', lab: 'Лабораторная работа', prac: 'Практика', kurs: 'Курсовая' }[t] || t; }
    function barClass(l) {
      if (l.type === 'lec' && l.subject === 'ВУЦ') return 'lec-vuc';
      return l.type;
    }
    function roomPhotoPath(lesson) {
      if (!lesson) return '';
      return String(lesson.roomSchemeUrl || '').trim();
    }
    function lTypeClass(l) {
      if (l.type === 'lec' && l.subject === 'ВУЦ') return 'lec-vuc';
      return l.type;
    }
    function lucideIcon(name, size) {
      return window.LUCIDE_ICONS ? window.LUCIDE_ICONS.svg(name, size) : '';
    }
    function wLbl(w) { return { both: 'Обе', odd: 'Нечётная', even: 'Чётная' }[w] || w; }
    function pN(lesson) {
      const n = Number(lesson && lesson.pairNum);
      return Number.isFinite(n) ? String(n) : '';
    }
    function wm(l, w) { 
      return l.week === 'both' || l.week === w; 
    }

    const VUC_REMAIN_AT_ANCHOR_WEEK = 9;
    const VUC_ANCHOR_DT = { y: 2026, m: 3, d: 9 };
    function mondayOfCalendarWeek(dt) {
      const x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
      const dow = x.getDay();
      x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
      return x;
    }
    function razWord(n) {
      const a = Math.abs(n) % 100;
      const b = n % 10;
      if (a > 10 && a < 20) return 'раз';
      if (b > 1 && b < 5) return 'раза';
      return 'раз';
    }
    function vucRemainderForDate(date) {
      if (vucDay.value === 'hide') return '';
      const anchorMon = mondayOfCalendarWeek(new Date(VUC_ANCHOR_DT.y, VUC_ANCHOR_DT.m, VUC_ANCHOR_DT.d));
      const thisMon = mondayOfCalendarWeek(date);
      const weekDelta = Math.round((thisMon - anchorMon) / (7 * 24 * 60 * 60 * 1000));
      const remaining = weekDelta < 0 ? VUC_REMAIN_AT_ANCHOR_WEEK : Math.max(0, VUC_REMAIN_AT_ANCHOR_WEEK - weekDelta);
      if (remaining === 0) return 'До конца ВУЦ визитов не осталось.';
      return `До конца ВУЦ осталось ${remaining} ${razWord(remaining)} сходить.`;
    }

    function sortL(a) {
      return [...a].sort((x, y) => {
        const px = Number(x && x.pairNum);
        const py = Number(y && y.pairNum);
        const hasPx = Number.isFinite(px);
        const hasPy = Number.isFinite(py);
        if (hasPx && hasPy && px !== py) return px - py;
        if (hasPx && !hasPy) return -1;
        if (!hasPx && hasPy) return 1;
        return timeToMin(x.start) - timeToMin(y.start);
      });
    }

    function buildDays(src) {
      const t0 = today.value;
      const days = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date(t0);
        date.setDate(t0.getDate() + i);
        const dow = date.getDay();
        const idx = dow === 0 ? 6 : dow - 1;
        const dayName = DAYS[idx];
        const dateStr = `${date.getDate()} ${monthGenitive(date.getMonth())}`;
        const isToday = sD(date, t0);
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
          const allLessons = filterVUC(src).filter(l => l.day === dayName && wm(l, dayWt));
          lessons = sortL(allLessons);
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
        visibleLessons: d.lessons.filter((l) => lessonShownLesson(l)),
        vucRemainderLine: vucRemainderForDate(d.date),
      }));
      if (fil.value === 'odd') return all.filter(d => d.weekType === 'odd');
      if (fil.value === 'even') return all.filter(d => d.weekType === 'even');
      return all;
    });

    const scheduleVisList = computed(() => sch.value.filter((l) => l.subject !== 'ВУЦ'));

    const calM = ref(new Date(today.value.getFullYear(), today.value.getMonth(), 1));
    const calDir = ref('next');
    const selD = ref(new Date(today.value));
    const mTitle = computed(() => {
      const m = calM.value, n = MN[m.getMonth()];
      return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + m.getFullYear();
    });
    function prevM() { calDir.value = 'prev'; const m = calM.value; calM.value = new Date(m.getFullYear(), m.getMonth() - 1, 1); }
    function nextM() { calDir.value = 'next'; const m = calM.value; calM.value = new Date(m.getFullYear(), m.getMonth() + 1, 1); }

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
        let ls = filterVUC(sch.value.filter(x => x.day === DAYS[idx] && wm(x, wt(date))), DAYS[idx]);
        if (meta && meta.preHoliday) ls = ls.filter(x => timeToMin(x.start) <= timeToMin('14:30'));
        ls = ls.filter((x) => lessonShownLesson(x));
        const dotTypes = [...new Set(ls.map(x => x.type === 'lec' && x.subject === 'ВУЦ' ? 'lec-vuc' : x.type))];
        cs.push({ day: d, date, cls: meta ? meta.cls : '', shortLabel: meta ? meta.shortLabel || '' : '', dots: dotTypes });
      }
      while (cs.length % 7 !== 0) cs.push(null);
      return cs;
    });

    function isTd(d) { return sD(d, today.value); }
    function sD(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    function fmtD(d) { const i = d.getDay() === 0 ? 6 : d.getDay() - 1; return `${DAYS[i]}, ${d.getDate()} ${monthGenitive(d.getMonth())}`; }

    const selL = computed(() => {
      if (!selD.value) return [];
      const date = selD.value, meta = getCellMeta(date);
      if (meta && ['weekend', 'holiday', 'credit-week', 'session', 'practice', 'vacation'].includes(meta.cls)) return [];
      const i = date.getDay() === 0 ? 6 : date.getDay() - 1;
      let ls = filterVUC(sch.value.filter(l => l.day === DAYS[i] && wm(l, wt(date))), DAYS[i]);
      if (meta && meta.preHoliday) ls = ls.filter(l => timeToMin(l.start) <= timeToMin('14:30'));
      ls = ls.filter((l) => lessonShownLesson(l));
      return sortL(ls);
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

    const lastFetchedLabel = computed(() => {
      const iso = fetchedAt;
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    });

    async function loadSchedule() {
      const seq = ++loadSeq;
      const cfg = typeof window.SCHEDULE_CONFIG === 'object' && window.SCHEDULE_CONFIG ? window.SCHEDULE_CONFIG : {};
      loadError.value = '';
      loadErrorStale.value = false;
      if (!cfg.webAppUrl) {
        loadError.value = 'В config.js укажите webAppUrl.';
        return;
      }
      if (loadTimeoutId) {
        clearTimeout(loadTimeoutId);
        loadTimeoutId = 0;
      }
      if (loadAbort) loadAbort.abort();
      loadAbort = new AbortController();
      const { signal } = loadAbort;
      let timedOut = false;
      loadTimeoutId = setTimeout(() => {
        if (seq !== loadSeq) return;
        timedOut = true;
        loadAbort.abort();
      }, FETCH_TIMEOUT_MS);

      loading.value = true;

      try {
        const rows = await fetchRowsFromConfig(cfg, { signal });
        if (seq !== loadSeq) return;
        const lessons = parseSheetValues(rows);
        sch.value = lessons;
        fetchedAt = new Date().toISOString();
        localStorage.setItem('sch3', JSON.stringify({ lessons, fetchedAt }));

        // Предзагрузка всех фотографий аудиторий
        setTimeout(() => {
          lessons.forEach(lesson => {
            if (lesson.roomSchemeUrl) {
              preloadRoomPhoto(lesson.roomSchemeUrl);
            }
          });
        }, 500);
      } catch (e) {
        if (seq !== loadSeq) return;
        if (e && e.name === 'AbortError') {
          if (timedOut) {
            if (sch.value.length) loadErrorStale.value = true;
            else loadError.value = 'Превышено время ожидания (' + Math.round(FETCH_TIMEOUT_MS / 1000) + ' с).';
          } else if (sch.value.length) {
            loadErrorStale.value = true;
          } else {
            loadError.value = 'Запрос отменён.';
          }
        } else {
          const msg = e && e.message ? e.message : String(e);
          if (sch.value.length) loadErrorStale.value = true;
          else loadError.value = msg;
        }
      } finally {
        if (seq === loadSeq) {
          clearTimeout(loadTimeoutId);
          loadTimeoutId = 0;
          loading.value = false;
        }
      }
    }

    let todayTickId = 0;
    function bumpToday() {
      today.value = new Date();
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') bumpToday();
    }

    function handleSwipe(el, onLeft, onRight) {
      let startX = 0, startY = 0, startTime = 0;
      const minSwipe = 50, maxTime = 300, maxVertical = 50;

      el.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();
      }, { passive: true });

      el.addEventListener('touchend', (e) => {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const diffX = endX - startX;
        const diffY = endY - startY;
        const time = Date.now() - startTime;

        if (time > maxTime || Math.abs(diffY) > maxVertical) return;
        if (Math.abs(diffX) < minSwipe) return;

        if (diffX > 0 && onRight) onRight();
        else if (diffX < 0 && onLeft) onLeft();
      }, { passive: true });
    }

    onMounted(() => {
      bumpToday();
      loadSchedule();
      todayTickId = setInterval(bumpToday, 60 * 1000);
      document.addEventListener('visibilitychange', onVisibility);
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      }
      applyAccentColor(accentColor.value);
      applyLessonColorScheme(lessonColorScheme.value);
    });

    watch(vm, () => {
      if (vm.value === 'calendar') {
        setTimeout(() => {
          if (calWrapRef.value) {
            handleSwipe(calWrapRef.value, () => { vibrate(); nextM(); }, () => { vibrate(); prevM(); });
          }
        }, 100);
      }
    });

    watch(showSettings, (open) => {
      document.documentElement.classList.toggle('settings-open', open);
    });

    watch(selectedLesson, (lesson) => {
      if (lesson) {
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
      } else {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      }
    });

    onUnmounted(() => {
      document.documentElement.classList.remove('settings-open');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      if (todayTickId) clearInterval(todayTickId);
      document.removeEventListener('visibilitychange', onVisibility);
      if (loadTimeoutId) clearTimeout(loadTimeoutId);
      if (loadAbort) loadAbort.abort();
    });

    return {
      schedule: sch, scheduleVisList, vm, fil,
      tfl, wLbl, pN, visModeLesson, setVisLesson, barClass, lTypeClass,
      fDays,
      showSettings, settingsTab, selectedLesson, theme, setTheme, vucDay, setVucDay, saveSettings, visSettings,
      accentColor, setAccentColor, accentColors,
      lessonColorScheme, setLessonColorScheme, lessonColorSchemes,
      glassBackground, setGlassBackground, glassBackgrounds,
      calM, calDir, mTitle, prevM, nextM, calCells, selD, isTd, sD, fmtD, selL, selPeriod,
      loading, loadError, loadErrorStale, loadSchedule, lucideIcon,
      lastFetchedLabel,
      lessonKey: lessonStableKey,
      vucRemainderForDate,
      vibrate,
      roomPhotoPath,
      preloadRoomPhoto,
      calWrapRef,
    };
  },
}).mount('#app');
