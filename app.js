const { createApp, ref, computed, reactive, onMounted, onUnmounted, watch, nextTick } = Vue;

const FETCH_TIMEOUT_MS = 20000;
const HARDCODED_LK_LINK = {
  id: 'lk-guap',
  title: 'ЛК ГУАП',
  url: 'https://pro.guap.ru/inside/profile',
  iconName: '',
  iconUrl: 'https://src.guap.ru/logos/guap/guap-sign_w.svg',
};

const DEFAULT_LINKS = [
  {
    id: 'mskzi-davydov',
    title: 'МСКЗИ | Давыдов',
    url: 'https://docs.google.com/spreadsheets/u/0/d/1r6Tmp2l60dQ9Atao4F1e1ITEgvskrM468asiUIs1svg/htmlview#gid=1324537187',
    iconName: 'key-round',
    iconUrl: '',
  },
  {
    id: 'db-elina',
    title: 'БД | Елина',
    url: 'https://docs.google.com/spreadsheets/d/1A84JKC8L6ls561CrD5LTrL3Ro81-psnB0stOl9cSLp4/edit?htmlview#gid=1185166563',
    iconName: 'database',
    iconUrl: '',
  },
];

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
  const dayRaw = isArrayRow ? row[0] : getObjectField(row, ['day', 'день', 'День']);
  const pairRaw = isArrayRow ? row[1] : getObjectField(row, ['pair', 'pairNum', 'номер пары', 'пара', 'Пара', '№ пары']);
  const startRaw = isArrayRow ? row[2] : getObjectField(row, ['start', 'startTime', 'начало', 'Начало']);
  const endRaw = isArrayRow ? row[3] : getObjectField(row, ['end', 'endTime', 'конец', 'Конец', 'Окончание']);
  const typeRaw = isArrayRow ? row[4] : getObjectField(row, ['type', 'тип', 'Тип']);
  const subjectRaw = isArrayRow ? row[5] : getObjectField(row, ['subject', 'дисциплина', 'предмет', 'Дисциплина']);
  const roomRaw = isArrayRow ? row[6] : getObjectField(row, ['room', 'аудитория', 'кабинет', 'Аудитория']);
  const roomSchemeUrlRaw = isArrayRow ? row[7] : getObjectField(row, ['roomSchemeUrl', 'roomPhotoUrl', 'схема', 'ссылка', 'Схема аудитории']);
  const teacherRaw = isArrayRow ? row[8] : getObjectField(row, ['teacher', 'преподаватель', 'Преподаватель']);
  const weekRaw = isArrayRow ? row[9] : getObjectField(row, ['week', 'неделя', 'Неделя']);

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

function formatRowDateLabel(dateRaw) {
  if (!dateRaw) return '';
  const d = dateRaw instanceof Date ? dateRaw : new Date(dateRaw);
  if (Number.isNaN(d.getTime())) return String(dateRaw).trim();
  const dow = d.getDay();
  const idx = dow === 0 ? 6 : dow - 1;
  return `${DAYS[idx]}, ${d.getDate()} ${monthGenitive(d.getMonth())}`;
}

function parseSessionItem(row, sheetRowIndex) {
  if (!row || typeof row !== 'object') return null;
  const dateRaw = getObjectField(row, ['Дата', 'date', 'Date']);
  const shiftRaw = getObjectField(row, ['№ смены', 'shift', 'смена']);
  const startRaw = getObjectField(row, ['Начало', 'start', 'начало']);
  const subject = String(getObjectField(row, ['Дисциплина', 'subject', 'дисциплина']) ?? '').trim();
  const room = String(getObjectField(row, ['Аудитория', 'room', 'аудитория']) ?? '').trim();
  const roomSchemeUrl = String(getObjectField(row, ['Схема аудитории', 'roomSchemeUrl', 'схема']) ?? '').trim();
  const teacher = String(getObjectField(row, ['Преподаватель', 'teacher']) ?? '').trim();
  if (!subject) return null;
  const dateObj = dateRaw ? new Date(dateRaw) : null;
  const dateValid = dateObj && !Number.isNaN(dateObj.getTime());
  const start = normalizeTime(startRaw);
  const shiftNum = Number(shiftRaw) || null;
  return {
    id: sheetRowIndex,
    date: dateValid ? dateObj : null,
    dateLabel: dateValid ? formatRowDateLabel(dateObj) : '',
    dateSort: dateValid ? dateObj.getTime() : 0,
    shiftNum,
    start,
    subject,
    room,
    roomSchemeUrl,
    teacher,
  };
}

function parseSessionsData(rows) {
  const out = [];
  if (!Array.isArray(rows)) return out;
  for (let i = 0; i < rows.length; i++) {
    const item = parseSessionItem(rows[i], i + 1);
    if (item) out.push(item);
  }
  out.sort((a, b) => {
    if (a.dateSort !== b.dateSort) return a.dateSort - b.dateSort;
    const sa = a.shiftNum || 0;
    const sb = b.shiftNum || 0;
    if (sa !== sb) return sa - sb;
    return timeToMin(a.start) - timeToMin(b.start);
  });
  return out;
}

function parseDisciplineItem(row, sheetRowIndex) {
  if (!row || typeof row !== 'object') return null;
  const subject = String(getObjectField(row, ['Дисциплина', 'subject', 'дисциплина']) ?? '').trim();
  const teacher = String(getObjectField(row, ['Преподаватель', 'teacher']) ?? '').trim();
  const controlType = String(getObjectField(row, ['Вид контроля', 'controlType', 'тип']) ?? '').trim();
  if (!subject) return null;
  return { id: sheetRowIndex, subject, teacher, controlType };
}

function parseDisciplinesData(rows) {
  const out = [];
  if (!Array.isArray(rows)) return out;
  for (let i = 0; i < rows.length; i++) {
    const item = parseDisciplineItem(rows[i], i + 1);
    if (item) out.push(item);
  }
  return out;
}

function parseLinkItem(row, sheetRowIndex) {
  if (!row || typeof row !== 'object') return null;
  const title = String(getObjectField(row, ['title', 'Title', 'название', 'Название', 'name', 'Name']) ?? '').trim();
  const url = String(getObjectField(row, ['url', 'URL', 'ссылка', 'Ссылка', 'href', 'link']) ?? '').trim();
  if (!title || !url) return null;

  const iconName = String(getObjectField(row, [
    'icon_name', 'iconName', 'icon', 'Иконка', 'иконка', 'iconSlug',
  ]) ?? '').trim();
  const iconUrl = String(getObjectField(row, [
    'icon_url', 'iconUrl', 'image', 'image_url', 'img', 'Картинка', 'картинка',
  ]) ?? '').trim();
  const idRaw = getObjectField(row, ['id', 'ID', 'Id']);
  const idNum = Number(idRaw);
  const id = Number.isFinite(idNum) && idNum > 0 ? idNum : sheetRowIndex;
  return { id, title, url, iconName, iconUrl };
}

function parseLinksData(rows) {
  const out = [];
  if (!Array.isArray(rows)) return out;
  for (let i = 0; i < rows.length; i++) {
    const item = parseLinkItem(rows[i], i + 1);
    if (item) out.push(item);
  }
  return out;
}

function extractRowsFromJson(j) {
  if (Array.isArray(j)) return j;
  if (j && j.error) throw new Error(String(j.error));
  if (j.values && Array.isArray(j.values)) return j.values;
  if (j.rows && Array.isArray(j.rows)) return j.rows;
  if (j.data && Array.isArray(j.data)) return j.data;
  if (j.data && j.data.rows && Array.isArray(j.data.rows)) return j.data.rows;
  if (j.data && j.data.values && Array.isArray(j.data.values)) return j.data.values;
  if (j.result && Array.isArray(j.result)) return j.result;
  throw new Error('Web App: ожидался массив или { data: [...] }');
}

function buildSheetUrl(webAppUrl, sheetName) {
  if (!sheetName) return webAppUrl;
  const sep = webAppUrl.includes('?') ? '&' : '?';
  return webAppUrl + sep + 'sheet=' + encodeURIComponent(sheetName);
}

async function fetchSheetFromConfig(cfg, sheetName, fetchOpts) {
  const url = buildSheetUrl(cfg.webAppUrl, sheetName);
  const res = await fetch(url, fetchOpts || {});
  if (!res.ok) throw new Error('Web App: ' + res.status + ' ' + res.statusText);
  const j = await res.json();
  return extractRowsFromJson(j);
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

    const sessions = ref([]);
    let sessionsFetchedAt = '';
    try {
      const s = localStorage.getItem('sess3');
      const d = s ? JSON.parse(s) : null;
      if (d && Array.isArray(d.items)) {
        sessions.value = d.items.map((item) => ({
          ...item,
          start: normalizeTime(item.start),
          date: item.date ? new Date(item.date) : null,
        }));
        sessionsFetchedAt = d.fetchedAt || '';
      }
    } catch (_) {}

    const disciplines = ref([]);
    let disciplinesFetchedAt = '';
    try {
      const s = localStorage.getItem('disc3');
      const d = s ? JSON.parse(s) : null;
      if (d && Array.isArray(d.items)) {
        disciplines.value = d.items;
        disciplinesFetchedAt = d.fetchedAt || '';
      }
    } catch (_) {}

    const activeSheet = ref('schedule');

    const settingsRaw = JSON.parse(localStorage.getItem('settings3') || '{}');
    const theme = ref(settingsRaw.theme || 'system');
    const vucDay = ref(settingsRaw.vucDay || 'hide');
    const accentColor = ref(settingsRaw.accentColor || 'blue');
    const lessonColorScheme = ref(settingsRaw.lessonColorScheme || 'default');
    const glassBackground = ref(settingsRaw.glassBackground || 'aurora');
    const customGlassImage = ref(settingsRaw.customGlassImage || '');
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
        customGlassImage: customGlassImage.value,
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
      custom: { name: 'Своё фото' },
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

      if (bg === 'custom' && customGlassImage.value) {
        el.style.setProperty('--custom-glass-image', `url(${customGlassImage.value})`);
      } else {
        el.style.removeProperty('--custom-glass-image');
      }
    }

    function setGlassBackground(bg) {
      glassBackground.value = bg;
      applyGlassBackground(bg);
      saveSettings();
    }

    function handleCustomImageUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        alert('Пожалуйста, выберите изображение');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        customGlassImage.value = e.target.result;
        glassBackground.value = 'custom';
        applyGlassBackground('custom');
        saveSettings();
      };
      reader.readAsDataURL(file);
    }

    function clearCustomImage() {
      customGlassImage.value = '';
      if (glassBackground.value === 'custom') {
        glassBackground.value = 'aurora';
        applyGlassBackground('aurora');
      }
      saveSettings();
    }

    const THEME_CSS_VARS = ['--lec', '--lab', '--prac', '--kurs', '--accent'];

    function setThemeCssVar(name, value) {
      document.documentElement.style.setProperty(name, value, 'important');
      if (document.body) document.body.style.setProperty(name, value, 'important');
    }

    function clearThemeCssVars() {
      [document.documentElement, document.body].forEach((el) => {
        if (!el) return;
        THEME_CSS_VARS.forEach((name) => el.style.removeProperty(name));
      });
    }

    function applyTheme(t) {
      const el = document.documentElement;
      const body = document.body;
      clearThemeCssVars();
      el.classList.remove('light', 'glass');
      if (t === 'light') el.classList.add('light');
      else if (t === 'glass') el.classList.add('glass');
      if (t === 'light') {
        el.style.background = '#f2f2f7';
        body.style.background = '#f2f2f7';
        el.style.colorScheme = 'light';
        el.style.removeProperty('--glass-bg');
      } else if (t === 'system') {
        el.style.background = '';
        body.style.background = '';
        el.style.colorScheme = 'light dark';
        el.style.removeProperty('--glass-bg');
      } else if (t === 'glass') {
        el.style.background = '#12121c';
        body.style.background = '#12121c';
        el.style.colorScheme = 'dark';
        applyGlassBackground(glassBackground.value);
      } else {
        el.style.background = '#1c1c1e';
        body.style.background = '#1c1c1e';
        el.style.colorScheme = 'dark';
        el.style.removeProperty('--glass-bg');
      }
      setTimeout(() => {
        applyAccentColor(accentColor.value);
        applyLessonColorScheme(lessonColorScheme.value);
      }, 0);
    }
    applyTheme(theme.value);
    function setTheme(t) { theme.value = t; applyTheme(t); saveSettings(); }

    const accentColors = {
      blue: { name: 'Синий', color: '#4f8cff', colorLight: '#2563eb' },
      indigo: { name: 'Индиго', color: '#818cf8', colorLight: '#4f46e5' },
      purple: { name: 'Фиолетовый', color: '#c084fc', colorLight: '#9333ea' },
      teal: { name: 'Бирюзовый', color: '#2dd4bf', colorLight: '#0f766e' },
      green: { name: 'Зелёный', color: '#34d399', colorLight: '#059669' },
      orange: { name: 'Оранжевый', color: '#f59e0b', colorLight: '#d97706' },
      rose: { name: 'Розовый', color: '#fb7185', colorLight: '#e11d48' },
      red: { name: 'Красный', color: '#f87171', colorLight: '#dc2626' },
    };

    const lessonColorSchemes = {
      default: {
        name: 'Баланс',
        dark: { lec: '#a78bfa', lab: '#38bdf8', prac: '#f59e0b', kurs: '#f472b6' },
        light: { lec: '#8b5cf6', lab: '#0284c7', prac: '#d97706', kurs: '#db2777' },
        glass: { lec: '#c4b5fd', lab: '#67e8f9', prac: '#fbbf24', kurs: '#f9a8d4' }
      },
      warm: {
        name: 'Тёплый',
        dark: { lec: '#fb7185', lab: '#fb923c', prac: '#fbbf24', kurs: '#f43f5e' },
        light: { lec: '#e11d48', lab: '#ea580c', prac: '#d97706', kurs: '#be123c' },
        glass: { lec: '#fda4af', lab: '#fdba74', prac: '#fcd34d', kurs: '#fb7185' }
      },
      cool: {
        name: 'Холодный',
        dark: { lec: '#2dd4bf', lab: '#22d3ee', prac: '#60a5fa', kurs: '#818cf8' },
        light: { lec: '#0f766e', lab: '#0e7490', prac: '#2563eb', kurs: '#4f46e5' },
        glass: { lec: '#5eead4', lab: '#67e8f9', prac: '#93c5fd', kurs: '#a5b4fc' }
      },
      pastel: {
        name: 'Мягкий',
        dark: { lec: '#c4b5fd', lab: '#7dd3fc', prac: '#fcd34d', kurs: '#f9a8d4' },
        light: { lec: '#8b5cf6', lab: '#0284c7', prac: '#b45309', kurs: '#be185d' },
        glass: { lec: '#ddd6fe', lab: '#bae6fd', prac: '#fde68a', kurs: '#fbcfe8' }
      },
      neon: {
        name: 'Энергия',
        dark: { lec: '#e879f9', lab: '#22d3ee', prac: '#facc15', kurs: '#f43f5e' },
        light: { lec: '#a21caf', lab: '#0e7490', prac: '#ca8a04', kurs: '#be123c' },
        glass: { lec: '#f0abfc', lab: '#67e8f9', prac: '#fde047', kurs: '#fb7185' }
      },
      forest: {
        name: 'Лес',
        dark: { lec: '#84cc16', lab: '#34d399', prac: '#f59e0b', kurs: '#65a30d' },
        light: { lec: '#65a30d', lab: '#059669', prac: '#b45309', kurs: '#4d7c0f' },
        glass: { lec: '#a3e635', lab: '#6ee7b7', prac: '#fbbf24', kurs: '#84cc16' }
      }
    };

    const accentPalette = Object.entries(accentColors).map(([key, meta]) => ({ key, ...meta }));
    const lessonSchemeChoices = Object.entries(lessonColorSchemes).map(([key, schemeData]) => ({ key, schemeData }));
    const glassBgChoices = Object.entries(glassBackgrounds).map(([key, bgData]) => ({ key, bgData }));

    function applyLessonColorScheme(schemeName) {
      const scheme = lessonColorSchemes[schemeName];
      if (!scheme) {
        return;
      }

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

      setThemeCssVar('--lec', colors.lec);
      setThemeCssVar('--lab', colors.lab);
      setThemeCssVar('--prac', colors.prac);
      setThemeCssVar('--kurs', colors.kurs);
    }

    function setLessonColorScheme(schemeName) {
      lessonColorScheme.value = schemeName;
      applyLessonColorScheme(schemeName);
      saveSettings();
    }

    function applyAccentColor(color) {
      const colorData = accentColors[color];
      if (!colorData) return;
      const currentTheme = theme.value;
      let isLight = false;

      if (currentTheme === 'light') {
        isLight = true;
      } else if (currentTheme === 'system') {
        isLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      }

      const accentValue = isLight ? colorData.colorLight : colorData.color;
      setThemeCssVar('--accent', accentValue);
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
    const sheetSwitchAnim = ref(true);
    const sheetSwitchKey = computed(() => activeSheet.value + ':' + fil.value);
    const showScheduleFilMenu = ref(false);
    const filterStripScrollRef = ref(null);
    const filterStripBarRef = ref(null);
    const hasFilterOverflow = ref(false);
    const filterBarThumbStyle = ref({ width: '0px', left: '0px' });
    let filterBarDrag = null;
    const schedulePillPressing = ref(false);
    const schedulePillRef = ref(null);
    const scheduleFilMenuStyle = ref({});
    const scheduleFilMenuPlacement = ref('down');
    const SCHEDULE_LONG_PRESS_MS = 480;
    const SCHEDULE_FIL_MENU_H = 168;
    let schedulePressTimer = null;
    let schedulePressOpened = false;

    function filLbl(f) {
      return { all: '2 недели', odd: 'Нечётная', even: 'Чётная' }[f] || f;
    }

    function updateScheduleFilMenuPos() {
      const el = schedulePillRef.value;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 8;
      const menuW = 156;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - menuW - 8));
      const spaceBelow = window.innerHeight - r.bottom - gap;
      const spaceAbove = r.top - gap;
      const openDown = spaceBelow >= SCHEDULE_FIL_MENU_H || spaceBelow >= spaceAbove;
      scheduleFilMenuPlacement.value = openDown ? 'down' : 'up';
      if (openDown) {
        scheduleFilMenuStyle.value = {
          position: 'fixed',
          top: `${r.bottom + gap}px`,
          left: `${left}px`,
          width: `${menuW}px`,
          zIndex: 10050,
        };
      } else {
        scheduleFilMenuStyle.value = {
          position: 'fixed',
          top: 'auto',
          bottom: `${window.innerHeight - r.top + gap}px`,
          left: `${left}px`,
          width: `${menuW}px`,
          zIndex: 10050,
        };
      }
    }

    function updateFilterBarThumb() {
      const el = filterStripScrollRef.value;
      const bar = filterStripBarRef.value;
      if (!el || !bar || !hasFilterOverflow.value) {
        filterBarThumbStyle.value = { width: '0px', left: '0px' };
        return;
      }
      const trackW = bar.clientWidth;
      const ratio = el.clientWidth / el.scrollWidth;
      const thumbW = Math.max(20, trackW * ratio);
      const maxScroll = el.scrollWidth - el.clientWidth;
      const maxThumbTravel = Math.max(0, trackW - thumbW);
      const left = maxScroll > 0 ? (el.scrollLeft / maxScroll) * maxThumbTravel : 0;
      filterBarThumbStyle.value = {
        width: `${thumbW}px`,
        left: `${left}px`,
      };
    }

    function updateFilterStripOverflow() {
      const el = filterStripScrollRef.value;
      hasFilterOverflow.value = !!el && (el.scrollWidth - el.clientWidth > 1);
      nextTick(updateFilterBarThumb);
    }

    function scrollActiveFilterTabIntoView(behavior) {
      const container = filterStripScrollRef.value;
      if (!container || vm.value !== 'list') return;
      const scrollBehavior = behavior || 'smooth';
      nextTick(() => {
        if (container.scrollWidth - container.clientWidth <= 1) return;
        let target = container.querySelector('.filter-pill.active');
        if (!target && activeSheet.value === 'schedule') {
          target = container.querySelector('.schedule-fil-wrap .filter-pill')
            || container.querySelector('.schedule-fil-wrap');
        }
        if (!target) return;
        const pad = 6;
        const cRect = container.getBoundingClientRect();
        const tRect = target.getBoundingClientRect();
        let delta = 0;
        if (tRect.left < cRect.left + pad) {
          delta = tRect.left - cRect.left - pad;
        } else if (tRect.right > cRect.right - pad) {
          delta = tRect.right - cRect.right + pad;
        }
        if (!delta) return;
        container.scrollBy({ left: delta, behavior: scrollBehavior });
        if (scrollBehavior === 'smooth') {
          setTimeout(updateFilterBarThumb, 280);
        } else {
          updateFilterBarThumb();
        }
      });
    }

    function onFilterStripScroll() {
      updateFilterBarThumb();
    }

    function onFilterBarPointerDown(e) {
      const el = filterStripScrollRef.value;
      const bar = filterStripBarRef.value;
      if (!el || !bar || e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      const trackW = bar.clientWidth;
      const ratio = el.clientWidth / el.scrollWidth;
      const thumbW = Math.max(20, trackW * ratio);
      const maxScroll = el.scrollWidth - el.clientWidth;
      const maxThumbTravel = Math.max(0, trackW - thumbW);
      const barRect = bar.getBoundingClientRect();
      const thumbLeft = maxScroll > 0 ? (el.scrollLeft / maxScroll) * maxThumbTravel : 0;
      const clickX = e.clientX - barRect.left;
      const onThumb = clickX >= thumbLeft && clickX <= thumbLeft + thumbW;

      if (!onThumb && maxThumbTravel > 0) {
        const targetLeft = Math.max(0, Math.min(maxThumbTravel, clickX - thumbW / 2));
        el.scrollLeft = (targetLeft / maxThumbTravel) * maxScroll;
        updateFilterBarThumb();
      }

      filterBarDrag = {
        startX: e.clientX,
        startScroll: el.scrollLeft,
        maxScroll,
        maxThumbTravel,
      };

      const onMove = (ev) => {
        if (!filterBarDrag) return;
        const dx = ev.clientX - filterBarDrag.startX;
        if (filterBarDrag.maxThumbTravel > 0) {
          el.scrollLeft = filterBarDrag.startScroll + (dx / filterBarDrag.maxThumbTravel) * filterBarDrag.maxScroll;
        }
        updateFilterBarThumb();
      };
      const onUp = () => {
        filterBarDrag = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }

    function clearSchedulePressTimer() {
      if (schedulePressTimer) {
        clearTimeout(schedulePressTimer);
        schedulePressTimer = null;
      }
      schedulePillPressing.value = false;
    }

    function openScheduleFilMenu() {
      activeSheet.value = 'schedule';
      showScheduleFilMenu.value = true;
      nextTick(() => updateScheduleFilMenuPos());
    }

    function closeScheduleFilMenu() {
      showScheduleFilMenu.value = false;
    }

    function selectScheduleFil(next) {
      vibrate();
      setFil(next);
      closeScheduleFilMenu();
    }

    function onSchedulePillPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      schedulePressOpened = false;
      schedulePillPressing.value = true;
      clearSchedulePressTimer();
      schedulePressTimer = setTimeout(() => {
        schedulePressTimer = null;
        schedulePressOpened = true;
        schedulePillPressing.value = false;
        vibrate();
        openScheduleFilMenu();
      }, SCHEDULE_LONG_PRESS_MS);
    }

    function onSchedulePillPointerUp() {
      clearSchedulePressTimer();
    }

    function onSchedulePillClick() {
      if (schedulePressOpened) {
        schedulePressOpened = false;
        return;
      }
      vibrate();
      closeScheduleFilMenu();
      if (activeSheet.value !== 'schedule') {
        setActiveSheet('schedule');
      }
    }

    function setFil(next) {
      activeSheet.value = 'schedule';
      fil.value = next;
      sheetSwitchAnim.value = true;
    }
    function setActiveSheet(sheet) {
      if (sheet === 'session' && !showSessionTab.value) return;
      if (activeSheet.value === sheet) return;
      closeScheduleFilMenu();
      activeSheet.value = sheet;
      if (sheet !== 'schedule') vm.value = 'list';
      sheetSwitchAnim.value = true;
      nextTick(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
      loadActiveSheet();
    }

    function toggleCalendarView() {
      if (vm.value === 'calendar') {
        sheetSwitchAnim.value = false;
        vm.value = 'list';
        nextTick(() => {
          sheetSwitchAnim.value = true;
        });
        return;
      }
      sheetSwitchAnim.value = false;
      vm.value = 'calendar';
    }

    const loadingLabel = computed(() => {
      if (activeSheet.value === 'session') return 'Загрузка сессии';
      if (activeSheet.value === 'disciplines') return 'Загрузка дисциплин';
      return 'Загрузка расписания';
    });

    const activeDataCount = computed(() => {
      if (activeSheet.value === 'session') return sessions.value.length;
      if (activeSheet.value === 'disciplines') return disciplines.value.length;
      return sch.value.length;
    });
    const showSettings = ref(false);

    function openSettings() {
      showSettings.value = true;
      document.documentElement.classList.add('settings-open');
    }

    function closeSettings() {
      showSettings.value = false;
      document.documentElement.classList.remove('settings-open');
    }
    const settingsTab = ref('schedule');
    const selectedLesson = ref(null);
    const calWrapRef = ref(null);
    const showLinksDropdown = ref(false);
    const links = ref([]);
    try {
      const s = localStorage.getItem('links3');
      const d = s ? JSON.parse(s) : null;
      if (d && Array.isArray(d.items)) links.value = d.items;
    } catch (_) {}
    const showGazpromModal = ref(false);
    const gazpromStep = ref(1);
    let gazpromClickCount = 0;
    let gazpromClickTimeout = null;

    function handleGazpromClick() {
      gazpromClickCount++;

      if (gazpromClickTimeout) {
        clearTimeout(gazpromClickTimeout);
      }

      gazpromClickTimeout = setTimeout(() => {
        gazpromClickCount = 0;
      }, 2000);

      if (gazpromClickCount === 5) {
        vibrate(50);
        showGazpromModal.value = true;
        gazpromStep.value = 1;
        gazpromClickCount = 0;
      }
    }

    function handleLinkSelect(event) {
      const url = event.target.value;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
        event.target.value = '';
      }
    }

    async function loadLinks(cfg) {
      if (!cfg || !cfg.webAppUrl) return;
      try {
        const rows = await fetchSheetFromConfig(cfg, 'links');
        const items = parseLinksData(rows);
        if (!items.length) return;
        links.value = items;
        localStorage.setItem('links3', JSON.stringify({ items }));
      } catch (_) {}
    }

    const usefulLinks = computed(() => {
      const dynamic = links.value.length ? links.value : DEFAULT_LINKS;
      const filtered = dynamic.filter((item) => {
        const itemUrl = String(item && item.url ? item.url : '').trim();
        return itemUrl !== HARDCODED_LK_LINK.url;
      });
      return [HARDCODED_LK_LINK, ...filtered];
    });

    function preloadRoomPhoto(room) {
      if (!room) return;
      const img = new Image();
      img.src = room;
    }

    function tfl(t) { return { lec: 'Лекция', lab: 'Лабораторная работа', prac: 'Практика', kurs: 'Курсовая' }[t] || t; }
    function controlTypeClass(controlType) {
      const s = String(controlType || '').trim().toLowerCase();
      if (s.includes('экзамен')) return 'ctrl-exam';
      if (s.includes('дифференц')) return 'ctrl-diff';
      if (s.includes('зачёт') || s.includes('зачет')) return 'ctrl-credit';
      return 'ctrl-other';
    }
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

    const sessionDays = computed(() => {
      const byKey = new Map();
      for (const sess of sessions.value) {
        const key = sess.dateSort ? String(sess.dateSort) : (sess.dateLabel || 'id-' + sess.id);
        if (!byKey.has(key)) {
          byKey.set(key, {
            dateLabel: sess.dateLabel || 'Без даты',
            dateSort: sess.dateSort || 0,
            date: sess.date,
            items: [],
          });
        }
        byKey.get(key).items.push(sess);
      }
      const list = [...byKey.values()];
      list.sort((a, b) => a.dateSort - b.dateSort);
      for (const group of list) {
        group.items.sort((a, b) => {
          const sa = a.shiftNum || 0;
          const sb = b.shiftNum || 0;
          if (sa !== sb) return sa - sb;
          return timeToMin(a.start) - timeToMin(b.start);
        });
      }
      return list;
    });

    const showSessionTab = computed(() => {
      if (!sessions.value.length) return false;
      const dated = sessions.value
        .map((item) => item.dateSort || 0)
        .filter((ts) => Number.isFinite(ts) && ts > 0)
        .sort((a, b) => a - b);
      if (!dated.length) return true;
      const firstDate = new Date(dated[0]);
      const lastDate = new Date(dated[dated.length - 1]);
      const openDate = new Date(firstDate);
      openDate.setDate(openDate.getDate() - 21);
      openDate.setHours(0, 0, 0, 0);
      lastDate.setHours(23, 59, 59, 999);
      const now = new Date(today.value);
      return now >= openDate && now <= lastDate;
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

    function hasCachedForSheet(sheet) {
      if (sheet === 'session') return sessions.value.length > 0;
      if (sheet === 'disciplines') return disciplines.value.length > 0;
      return sch.value.length > 0;
    }

    const lastFetchedLabel = computed(() => {
      let iso = fetchedAt;
      if (activeSheet.value === 'session') iso = sessionsFetchedAt;
      else if (activeSheet.value === 'disciplines') iso = disciplinesFetchedAt;
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

    async function loadActiveSheet() {
      const sheet = activeSheet.value;
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
        const rows = await fetchSheetFromConfig(cfg, sheet, { signal });
        if (seq !== loadSeq) return;
        const now = new Date().toISOString();

        if (sheet === 'session') {
          const items = parseSessionsData(rows);
          sessions.value = items;
          sessionsFetchedAt = now;
          localStorage.setItem('sess3', JSON.stringify({
            items: items.map((item) => ({
              ...item,
              date: item.date ? item.date.toISOString() : null,
            })),
            fetchedAt: sessionsFetchedAt,
          }));
          setTimeout(() => {
            items.forEach((item) => {
              if (item.roomSchemeUrl) preloadRoomPhoto(item.roomSchemeUrl);
            });
          }, 500);
        } else if (sheet === 'disciplines') {
          const items = parseDisciplinesData(rows);
          disciplines.value = items;
          disciplinesFetchedAt = now;
          localStorage.setItem('disc3', JSON.stringify({ items, fetchedAt: disciplinesFetchedAt }));
        } else {
          const lessons = parseSheetValues(rows);
          sch.value = lessons;
          fetchedAt = now;
          localStorage.setItem('sch3', JSON.stringify({ lessons, fetchedAt }));
          setTimeout(() => {
            lessons.forEach((lesson) => {
              if (lesson.roomSchemeUrl) preloadRoomPhoto(lesson.roomSchemeUrl);
            });
          }, 500);
        }
      } catch (e) {
        if (seq !== loadSeq) return;
        if (e && e.name === 'AbortError') {
          if (timedOut) {
            if (hasCachedForSheet(sheet)) loadErrorStale.value = true;
            else loadError.value = 'Превышено время ожидания (' + Math.round(FETCH_TIMEOUT_MS / 1000) + ' с).';
          } else if (hasCachedForSheet(sheet)) {
            loadErrorStale.value = true;
          } else {
            loadError.value = 'Запрос отменён.';
          }
        } else {
          const msg = e && e.message ? e.message : String(e);
          if (hasCachedForSheet(sheet)) loadErrorStale.value = true;
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

    function loadSchedule() {
      return loadActiveSheet();
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
      loadActiveSheet();
      const cfg = typeof window.SCHEDULE_CONFIG === 'object' && window.SCHEDULE_CONFIG ? window.SCHEDULE_CONFIG : {};
      loadLinks(cfg);
      nextTick(() => {
        updateFilterStripOverflow();
        scrollActiveFilterTabIntoView('auto');
      });
      todayTickId = setInterval(bumpToday, 60 * 1000);
      document.addEventListener('visibilitychange', onVisibility);
      if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
        navigator.serviceWorker.register('service-worker.js').catch(() => {});
      }
      applyAccentColor(accentColor.value);
      applyLessonColorScheme(lessonColorScheme.value);

      document.addEventListener('click', (e) => {
        if (showLinksDropdown.value && !e.target.closest('.dropdown-wrap')) {
          showLinksDropdown.value = false;
        }
        if (showScheduleFilMenu.value && !e.target.closest('.schedule-fil-wrap') && !e.target.closest('.filter-pill-menu--teleport')) {
          showScheduleFilMenu.value = false;
        }
      });

      let lastScrollY = window.scrollY;
      window.addEventListener('scroll', () => {
        if (showLinksDropdown.value && Math.abs(window.scrollY - lastScrollY) > 5) {
          showLinksDropdown.value = false;
        }
        if (showScheduleFilMenu.value && Math.abs(window.scrollY - lastScrollY) > 5) {
          showScheduleFilMenu.value = false;
        }
        lastScrollY = window.scrollY;
      }, { passive: true });

      window.addEventListener('resize', onScheduleFilMenuLayout);
    });

    function onScheduleFilMenuLayout() {
      if (showScheduleFilMenu.value) updateScheduleFilMenuPos();
      updateFilterStripOverflow();
    }

    watch(showScheduleFilMenu, (open) => {
      if (open) nextTick(() => updateScheduleFilMenuPos());
    });

    watch(showSessionTab, (isVisible) => {
      if (!isVisible && activeSheet.value === 'session') {
        activeSheet.value = 'schedule';
      }
      nextTick(() => {
        updateFilterStripOverflow();
        scrollActiveFilterTabIntoView('auto');
      });
    });

    watch(activeSheet, () => {
      scrollActiveFilterTabIntoView();
    });

    watch(() => usefulLinks.value.length, () => {
      nextTick(updateFilterStripOverflow);
    });

    watch(vm, () => {
      if (vm.value === 'calendar') {
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        setTimeout(() => {
          if (calWrapRef.value) {
            handleSwipe(calWrapRef.value, () => { vibrate(); nextM(); }, () => { vibrate(); prevM(); });
          }
        }, 100);
      } else {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        nextTick(() => {
          updateFilterStripOverflow();
          scrollActiveFilterTabIntoView('auto');
        });
      }
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
      window.removeEventListener('resize', onScheduleFilMenuLayout);
      if (loadTimeoutId) clearTimeout(loadTimeoutId);
      if (loadAbort) loadAbort.abort();
    });

    return {
      schedule: sch, scheduleVisList, vm, fil, filLbl, setFil, activeSheet, setActiveSheet, toggleCalendarView, loadingLabel,
      showScheduleFilMenu, schedulePillPressing, schedulePillRef, scheduleFilMenuStyle, scheduleFilMenuPlacement,
      onSchedulePillPointerDown, onSchedulePillPointerUp, onSchedulePillClick,
      openScheduleFilMenu, selectScheduleFil,
      sheetSwitchAnim, sheetSwitchKey,
      sessions, sessionDays, showSessionTab, disciplines, activeDataCount,
      tfl, wLbl, pN, controlTypeClass, visModeLesson, setVisLesson, barClass, lTypeClass,
      fDays, isTd, sD,
      showSettings, openSettings, closeSettings,
      settingsTab, selectedLesson, theme, setTheme, vucDay, setVucDay, saveSettings, visSettings,
      accentColor, setAccentColor, accentPalette,
      lessonColorScheme, setLessonColorScheme, lessonSchemeChoices,
      glassBackground, setGlassBackground, glassBgChoices,
      customGlassImage, handleCustomImageUpload, clearCustomImage,
      calM, calDir, mTitle, prevM, nextM, calCells, selD, fmtD, selL, selPeriod,
      loading, loadError, loadErrorStale, loadSchedule, loadActiveSheet, lucideIcon,
      lastFetchedLabel,
      lessonKey: lessonStableKey,
      vucRemainderForDate,
      vibrate,
      roomPhotoPath,
      preloadRoomPhoto,
      calWrapRef,
      filterStripScrollRef,
      filterStripBarRef,
      hasFilterOverflow,
      filterBarThumbStyle,
      onFilterStripScroll,
      onFilterBarPointerDown,
      showLinksDropdown,
      usefulLinks,
      handleLinkSelect,
      showGazpromModal,
      gazpromStep,
      handleGazpromClick,
    };
  },
}).mount('#app');
