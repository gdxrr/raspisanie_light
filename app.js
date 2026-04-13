const { createApp, ref, computed, reactive, onMounted, onUnmounted, watch } = Vue;

const SCH_META_KEY = 'sch3_meta';
const FETCH_TIMEOUT_MS = 20000;

function readSchMeta() {
  try {
    return JSON.parse(localStorage.getItem(SCH_META_KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function writeSchMeta(partial) {
  const cur = readSchMeta();
  localStorage.setItem(SCH_META_KEY, JSON.stringify({ ...cur, ...partial }));
}

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

async function fetchRowsFromConfig(cfg, fetchOpts) {
  const res = await fetch(cfg.webAppUrl, fetchOpts || {});
  if (!res.ok) throw new Error('Web App: ' + res.status + ' ' + res.statusText);
  const j = await res.json();
  if (Array.isArray(j)) return j;
  if (j.values && Array.isArray(j.values)) return j.values;
  if (j.rows && Array.isArray(j.rows)) return j.rows;
  throw new Error('Web App: ожидался массив или { values: [...] }');
}

createApp({
  setup() {
    const today = ref(new Date());

    function vibrate(ms) {
      if (navigator.vibrate) navigator.vibrate(ms || 10);
    }

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
    const vucDay = ref(settingsRaw.vucDay || 'hide');
    const accentColor = ref(settingsRaw.accentColor || 'blue');
    const lessonColorScheme = ref(settingsRaw.lessonColorScheme || 'default');
    const glassBackground = ref(settingsRaw.glassBackground || 'aurora');
    const visSettings = reactive(settingsRaw.vis || {});

    const meta0 = readSchMeta();
    const lastFetchedAt = ref(typeof meta0.fetchedAt === 'string' ? meta0.fetchedAt : '');

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

      // Удаляем все классы фонов
      Object.keys(glassBackgrounds).forEach(key => {
        el.classList.remove('glass-bg-' + key);
      });

      // Добавляем нужный класс
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
      // Применить акцентный цвет после смены темы
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

    // Применить акцентный цвет после применения темы
    watch(theme, () => {
      applyAccentColor(accentColor.value);
      applyLessonColorScheme(lessonColorScheme.value);
    });

    // Слушатель для system темы
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      mediaQuery.addEventListener('change', () => {
        if (theme.value === 'system') {
          applyAccentColor(accentColor.value);
          applyLessonColorScheme(lessonColorScheme.value);
        }
      });
    }

    function filterVUC(lessons) {
      if (vucDay.value === 'hide') return lessons.filter(l => l.subject !== 'ВУЦ');
      const targetDay = vucDay.value === 'wed' ? 'Среда' : 'Четверг';
      return lessons.map(l => l.subject === 'ВУЦ' ? { ...l, day: targetDay } : l);
    }

    const vm = ref('list');
    const fil = ref('all');
    const cwt = computed(() => wt(today.value));
    const showSettings = ref(false);
    const settingsTab = ref('schedule');
    const selectedLesson = ref(null);

    // Предзагрузка фото при наведении на пару
    function preloadRoomPhoto(room) {
      const path = roomPhotoPath(room);
      if (!path) return;
      const img = new Image();
      img.src = path;
    }

    function tfl(t) { return { lec: 'Лекция', lab: 'Лабораторная работа', prac: 'Практика', kurs: 'Курсовая' }[t] || t; }
    function barClass(l) {
      if (l.type === 'lec' && l.subject === 'ВУЦ') return 'lec-vuc';
      return l.type;
    }
    function roomPhotoPath(room) {
      if (!room) return null;
      // Извлекаем номер аудитории после символа |
      const parts = room.split('|');
      const roomNum = parts.length > 1 ? parts[1].trim() : room.trim();
      if (!roomNum) return null;

      // Проверяем, есть ли упоминание корпуса Гастелло
      const fullRoom = room.toLowerCase();
      if (fullRoom.includes('гастелло') || fullRoom.includes('gast')) {
        return `photo_aud/gast ${roomNum}.PNG`;
      }

      return `photo_aud/${roomNum}.PNG`;
    }
    function lTypeClass(l) {
      if (l.type === 'lec' && l.subject === 'ВУЦ') return 'lec-vuc';
      return l.type;
    }
    function lucideIcon(name, size) {
      return window.LUCIDE_ICONS ? window.LUCIDE_ICONS.svg(name, size) : '';
    }
    function wLbl(w) { return { both: 'Обе', odd: 'Нечётная', even: 'Чётная' }[w] || w; }
    function pN(s) { const n = PAIR_TIMES[s]; return n != null ? (n === 0 ? '' : String(n)) : ''; }
    function wm(l, w) { return l.week === 'both' || l.week === w; }

    /** 09.04: в этой календарной неделе (пн–вс) остаётся 9 занятий; каждую следующую неделю −1. */
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
      if (vucDay.value !== 'thu') return '';
      const lessons = sch.value;
      if (!lessons.some((l) => l.subject === 'ВУЦ')) return '';
      const anchorMon = mondayOfCalendarWeek(new Date(VUC_ANCHOR_DT.y, VUC_ANCHOR_DT.m, VUC_ANCHOR_DT.d));
      const thisMon = mondayOfCalendarWeek(date);
      const weekDelta = Math.round((thisMon - anchorMon) / (7 * 24 * 60 * 60 * 1000));
      const remaining = weekDelta < 0 ? VUC_REMAIN_AT_ANCHOR_WEEK : Math.max(0, VUC_REMAIN_AT_ANCHOR_WEEK - weekDelta);
      if (remaining === 0) return 'До конца ВУЦ визитов не осталось.';
      return `До конца ВУЦ осталось ${remaining} ${razWord(remaining)} сходить.`;
    }
    const vucRemainderLine = computed(() => vucRemainderForDate(today.value));

    function ndDate(dn) {
      const t = DOW[dn], d = new Date(today.value), diff = (t - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      return d;
    }

    function sortL(a) { return [...a].sort((x, y) => timeToMin(x.start) - timeToMin(y.start)); }

    function buildDays(src) {
      const t0 = today.value;
      const days = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date(t0);
        date.setDate(t0.getDate() + i);
        const dow = date.getDay();
        const idx = dow === 0 ? 6 : dow - 1;
        const dayName = DAYS[idx];
        const dateStr = `${date.getDate()} ${MG[date.getMonth()]}`;
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
        visibleLessons: d.lessons.filter((l) => lessonShownLesson(l)),
        vucRemainderLine: vucRemainderForDate(d.date),
      }));
      if (fil.value === 'odd') return all.filter(d => d.weekType === 'odd');
      if (fil.value === 'even') return all.filter(d => d.weekType === 'even');
      return all;
    });

    const scheduleVisList = computed(() => sch.value.filter((l) => l.subject !== 'ВУЦ'));

    const calM = ref(new Date(today.value.getFullYear(), today.value.getMonth(), 1));
    const selD = ref(new Date(today.value));
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
        ls = ls.filter((x) => lessonShownLesson(x));
        const dotTypes = [...new Set(ls.map(x => x.type === 'lec' && x.subject === 'ВУЦ' ? 'lec-vuc' : x.type))];
        cs.push({ day: d, date, cls: meta ? meta.cls : '', shortLabel: meta ? meta.shortLabel || '' : '', dots: dotTypes });
      }
      while (cs.length % 7 !== 0) cs.push(null);
      return cs;
    });

    function isTd(d) { return sD(d, today.value); }
    function sD(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
    function fmtD(d) { const i = d.getDay() === 0 ? 6 : d.getDay() - 1; return `${DAYS[i]}, ${d.getDate()} ${MG[d.getMonth()]}`; }

    const selL = computed(() => {
      if (!selD.value) return [];
      const date = selD.value, meta = getCellMeta(date);
      if (meta && ['weekend', 'holiday', 'credit-week', 'session', 'practice', 'vacation'].includes(meta.cls)) return [];
      const i = date.getDay() === 0 ? 6 : date.getDay() - 1;
      let ls = filterVUC(sch.value.filter(l => l.day === DAYS[i] && wm(l, wt(date))));
      if (meta && meta.preHoliday) ls = ls.filter(l => timeToMin(l.start) <= timeToMin('14:30'));
      ls = ls.filter((l) => lessonShownLesson(l));
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

    const lastFetchedLabel = computed(() => {
      const iso = lastFetchedAt.value;
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

      // Показываем загрузку только если нет кэша
      const hasCache = sch.value.length > 0;
      if (!hasCache) {
        loading.value = true;
      }

      try {
        const rows = await fetchRowsFromConfig(cfg, { signal });
        if (seq !== loadSeq) return;
        const lessons = parseSheetValues(rows);
        sch.value = lessons;
        localStorage.setItem('sch3', JSON.stringify(lessons));
        const fetchedAt = new Date().toISOString();
        lastFetchedAt.value = fetchedAt;
        writeSchMeta({ fetchedAt });
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

    onMounted(() => {
      bumpToday();
      loadSchedule();
      todayTickId = setInterval(bumpToday, 60 * 1000);
      document.addEventListener('visibilitychange', onVisibility);
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }
      // Применить акцентный цвет после монтирования
      applyAccentColor(accentColor.value);
      applyLessonColorScheme(lessonColorScheme.value);
    });

    watch(showSettings, (open) => {
      document.documentElement.classList.toggle('settings-open', open);
    });
    onUnmounted(() => {
      document.documentElement.classList.remove('settings-open');
      if (todayTickId) clearInterval(todayTickId);
      document.removeEventListener('visibilitychange', onVisibility);
      if (loadTimeoutId) clearTimeout(loadTimeoutId);
      if (loadAbort) loadAbort.abort();
    });

    // === Поиск групп ===
    const showGroupSearch = ref(false);
    const searchQuery = ref('');
    const searchResults = ref([]);
    const searchLoading = ref(false);
    const searchError = ref('');
    const selectedSearchGroup = ref(null);
    const groupScheduleData = ref(null);
    const groupScheduleLoading = ref(false);
    const groupScheduleError = ref('');
    const favoriteGroups = ref([]);
    const searchInput = ref(null);

    // Кэш для поиска групп и расписаний
    const GROUPS_CACHE_KEY = 'groupsCache';
    const SCHEDULE_CACHE_KEY_PREFIX = 'scheduleCache_';
    const FAVORITES_KEY = 'favoriteGroups';
    const CACHE_DURATION = 60 * 60 * 1000; // 1 час

    // Загрузка избранного из localStorage
    function loadFavorites() {
      try {
        const stored = localStorage.getItem(FAVORITES_KEY);
        if (stored) {
          favoriteGroups.value = JSON.parse(stored);
        }
      } catch (e) {
        console.error('Error loading favorites:', e);
      }
    }

    function saveFavorites() {
      try {
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteGroups.value));
      } catch (e) {
        console.error('Error saving favorites:', e);
      }
    }

    function isFavorite(groupId) {
      return favoriteGroups.value.some(f => f.id === groupId);
    }

    function toggleFavorite(group) {
      const idx = favoriteGroups.value.findIndex(f => f.id === group.id);
      if (idx >= 0) {
        favoriteGroups.value.splice(idx, 1);
      } else {
        favoriteGroups.value.push({ id: group.id, name: group.name });
      }
      saveFavorites();
    }

    function removeFavorite(groupId) {
      const idx = favoriteGroups.value.findIndex(f => f.id === groupId);
      if (idx >= 0) {
        favoriteGroups.value.splice(idx, 1);
        saveFavorites();
      }
    }

    // Получение кэша
    function getCache(key) {
      try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp > CACHE_DURATION) {
          localStorage.removeItem(key);
          return null;
        }
        return data.value;
      } catch (e) {
        return null;
      }
    }

    function setCache(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify({
          value,
          timestamp: Date.now()
        }));
      } catch (e) {
        console.error('Cache error:', e);
      }
    }

    let searchTimeout = null;
    async function handleSearchInput() {
      if (searchTimeout) clearTimeout(searchTimeout);

      const query = searchQuery.value.trim();
      if (!query) {
        searchResults.value = [];
        return;
      }

      searchTimeout = setTimeout(async () => {
        await searchGroups(query);
      }, 300);
    }

    async function searchGroups(query) {
      searchLoading.value = true;
      searchError.value = '';

      try {
        // Проверяем кэш
        const cached = getCache(GROUPS_CACHE_KEY);
        let allGroups = cached;

        if (!allGroups) {
          // Запрос к API
          const response = await fetch(`/api/schedule?action=search&query=`);
          if (!response.ok) throw new Error('Ошибка загрузки списка групп');
          const data = await response.json();
          if (!data.success) throw new Error(data.error || 'Ошибка API');
          allGroups = data.groups;
          setCache(GROUPS_CACHE_KEY, allGroups);
        }

        // Фильтруем локально
        const filtered = allGroups.filter(g =>
          g.name.toLowerCase().includes(query.toLowerCase())
        );
        searchResults.value = filtered.slice(0, 20);
      } catch (e) {
        searchError.value = e.message || 'Ошибка поиска';
        searchResults.value = [];
      } finally {
        searchLoading.value = false;
      }
    }

    async function loadGroupSchedule(groupId, groupName) {
      selectedSearchGroup.value = { id: groupId, name: groupName };
      groupScheduleLoading.value = true;
      groupScheduleError.value = '';
      groupScheduleData.value = null;

      try {
        // Проверяем кэш
        const cacheKey = SCHEDULE_CACHE_KEY_PREFIX + groupId;
        const cached = getCache(cacheKey);

        if (cached) {
          groupScheduleData.value = cached;
          groupScheduleLoading.value = false;
          return;
        }

        // Запрос к API
        const response = await fetch(`/api/schedule?action=schedule&groupId=${groupId}`);
        if (!response.ok) throw new Error('Ошибка загрузки расписания');
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Ошибка API');

        groupScheduleData.value = data.schedule;
        setCache(cacheKey, data.schedule);
      } catch (e) {
        groupScheduleError.value = e.message || 'Ошибка загрузки расписания';
      } finally {
        groupScheduleLoading.value = false;
      }
    }

    const groupScheduleDays = computed(() => {
      if (!groupScheduleData.value) return [];

      const dayOrder = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
      const grouped = {};

      groupScheduleData.value.lessons.forEach(lesson => {
        if (!grouped[lesson.day]) {
          grouped[lesson.day] = [];
        }
        grouped[lesson.day].push(lesson);
      });

      return dayOrder
        .filter(day => grouped[day])
        .map(day => ({
          name: day,
          lessons: grouped[day].sort((a, b) => a.pairNum - b.pairNum)
        }));
    });

    function barClassForType(type) {
      const normalized = type.toLowerCase();
      if (normalized.includes('лек')) return 'lec';
      if (normalized.includes('лаб')) return 'lab';
      if (normalized.includes('практ')) return 'prac';
      if (normalized.includes('курс')) return 'kurs';
      return 'lec';
    }

    function lTypeClassForType(type) {
      return barClassForType(type);
    }

    function closeGroupSearch() {
      showGroupSearch.value = false;
      searchQuery.value = '';
      searchResults.value = [];
      selectedSearchGroup.value = null;
      groupScheduleData.value = null;
      searchError.value = '';
      groupScheduleError.value = '';
    }

    // Touch handling для свайпа вниз
    let touchStartY = 0;
    let touchStartTime = 0;
    function handleSearchTouchStart(e) {
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    }

    function handleSearchTouchMove(e) {
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY;

      // Если свайп вниз и модальное окно прокручено вверх
      if (deltaY > 0) {
        const modal = e.currentTarget;
        if (modal.scrollTop === 0) {
          // Можно добавить визуальный эффект следования
        }
      }
    }

    function handleSearchTouchEnd(e) {
      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchEndY - touchStartY;
      const deltaTime = Date.now() - touchStartTime;

      // Если быстрый свайп вниз больше 100px
      if (deltaY > 100 && deltaTime < 300) {
        closeGroupSearch();
      }
    }

    // Автофокус на поле поиска при открытии
    watch(showGroupSearch, (newVal) => {
      if (newVal) {
        setTimeout(() => {
          if (searchInput.value) {
            searchInput.value.focus();
          }
        }, 300);
      }
    });

    // Загрузка избранного при монтировании
    onMounted(() => {
      loadFavorites();
    });

    return {
      schedule: sch, scheduleVisList, vm, fil, cwt,
      tfl, wLbl, pN, visModeLesson, setVisLesson, barClass, lTypeClass,
      fDays,
      showSettings, settingsTab, selectedLesson, theme, setTheme, vucDay, setVucDay, saveSettings, visSettings,
      accentColor, setAccentColor, accentColors,
      lessonColorScheme, setLessonColorScheme, lessonColorSchemes,
      glassBackground, setGlassBackground, glassBackgrounds,
      calM, mTitle, prevM, nextM, calCells, selD, isTd, sD, fmtD, selL, selPeriod,
      loading, loadError, loadErrorStale, loadSchedule, lucideIcon,
      lastFetchedLabel,
      lessonKey: lessonStableKey,
      // Поиск групп
      showGroupSearch, searchQuery, searchResults, searchLoading, searchError,
      selectedSearchGroup, groupScheduleData, groupScheduleLoading, groupScheduleError,
      favoriteGroups, searchInput,
      handleSearchInput, loadGroupSchedule, closeGroupSearch,
      isFavorite, toggleFavorite, removeFavorite,
      groupScheduleDays, barClassForType, lTypeClassForType,
      handleSearchTouchStart, handleSearchTouchMove, handleSearchTouchEnd,
      vucRemainderLine,
      vucRemainderForDate,
      vibrate,
      roomPhotoPath,
      preloadRoomPhoto,
    };
  },
}).mount('#app');
