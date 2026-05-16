(function () {
  'use strict';

  // ==================== CONFIG ====================
  var CONFIG = {
    appName: 'Weather Forecast',
    storageKey: 'mdg_weather',
    api: {
      weatherBase: 'https://api.open-meteo.com/v1/forecast',
      geocodeBase: 'https://nominatim.openstreetmap.org/reverse',
      cacheDuration: 30 * 60 * 1000,
    },
  };

  // WMO weather interpretation codes
  var WEATHER = {
    0:  { desc: 'Clear sky',         emoji: '☀️' },
    1:  { desc: 'Mainly clear',      emoji: '🌤️' },
    2:  { desc: 'Partly cloudy',     emoji: '⛅' },
    3:  { desc: 'Overcast',          emoji: '☁️' },
    45: { desc: 'Foggy',             emoji: '🌫️' },
    48: { desc: 'Icy fog',           emoji: '🌫️' },
    51: { desc: 'Light drizzle',     emoji: '🌦️' },
    53: { desc: 'Drizzle',           emoji: '🌧️' },
    55: { desc: 'Heavy drizzle',     emoji: '🌧️' },
    61: { desc: 'Light rain',        emoji: '🌧️' },
    63: { desc: 'Rain',              emoji: '🌧️' },
    65: { desc: 'Heavy rain',        emoji: '🌧️' },
    71: { desc: 'Light snow',        emoji: '🌨️' },
    73: { desc: 'Snow',              emoji: '❄️' },
    75: { desc: 'Heavy snow',        emoji: '❄️' },
    77: { desc: 'Snow grains',       emoji: '🌨️' },
    80: { desc: 'Rain showers',      emoji: '🌦️' },
    81: { desc: 'Showers',           emoji: '🌦️' },
    82: { desc: 'Heavy showers',     emoji: '⛈️' },
    85: { desc: 'Snow showers',      emoji: '🌨️' },
    86: { desc: 'Heavy snow showers',emoji: '🌨️' },
    95: { desc: 'Thunderstorm',      emoji: '⛈️' },
    96: { desc: 'Thunderstorm',      emoji: '⛈️' },
    99: { desc: 'Severe storm',      emoji: '⛈️' },
  };

  var DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // ==================== STATE ====================
  var state = {
    currentScreen: 'home',
    screenHistory: [],
    data: {
      forecast: null,
      location: null,
      cachedAt: null,
    },
    selectedDayIndex: 0,
  };

  var screens = {};

  // ==================== NAVIGATION ====================
  function collectScreens() {
    document.querySelectorAll('.screen').forEach(function (s) {
      if (s.id) screens[s.id] = s;
    });
  }

  function navigateTo(screenId, options) {
    options = options || {};
    var addToHistory = options.addToHistory !== false;
    if (addToHistory && state.currentScreen) {
      state.screenHistory.push(state.currentScreen);
    }
    Object.values(screens).forEach(function (s) { s.classList.add('hidden'); });
    if (screens[screenId]) {
      screens[screenId].classList.remove('hidden');
      state.currentScreen = screenId;
      onScreenEnter(screenId);
      focusFirst(screens[screenId]);
    }
  }

  function navigateBack() {
    if (state.screenHistory.length > 0) {
      navigateTo(state.screenHistory.pop(), { addToHistory: false });
    }
  }

  // ==================== FOCUS ====================
  function focusFirst(container) {
    var el = container.querySelector('.focusable:not([disabled]):not(.hidden)');
    if (el) el.focus();
  }

  function moveFocus(direction) {
    // On the detail screen, Left/Right flips between days instead of moving focus
    if (state.currentScreen === 'detail') {
      if (direction === 'left')  { goToDay(state.selectedDayIndex - 1); return; }
      if (direction === 'right') { goToDay(state.selectedDayIndex + 1); return; }
    }

    var container = screens[state.currentScreen];
    if (!container) return;

    var focusables = Array.from(
      container.querySelectorAll('.focusable:not([disabled]):not(.hidden)')
    );
    if (!focusables.length) return;

    var idx = focusables.indexOf(document.activeElement);
    if (idx === -1) { focusFirst(container); return; }

    var next;
    if (direction === 'up' || direction === 'left') {
      next = idx > 0 ? idx - 1 : focusables.length - 1;
    } else {
      next = idx < focusables.length - 1 ? idx + 1 : 0;
    }

    focusables[next].focus();
    var scrollParent = focusables[next].closest('.content, .forecast-list');
    if (scrollParent) {
      focusables[next].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // ==================== WEATHER HELPERS ====================
  function getWeather(code) {
    return WEATHER[code] || { desc: 'Unknown', emoji: '🌡️' };
  }

  function fmtTemp(c) { return Math.round(c) + '°C'; }

  function dayName(dateStr, index) {
    if (index === 0) return 'Today';
    if (index === 1) return 'Tomorrow';
    return DAYS[new Date(dateStr + 'T12:00:00').getDay()];
  }

  function shortDate(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    return d.getDate() + ' ' + MONTHS[d.getMonth()];
  }

  // ==================== FETCH ====================
  function fetchWeather() {
    showLoading(true);

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude.toFixed(4);
        var lon = pos.coords.longitude.toFixed(4);

        var wUrl = CONFIG.api.weatherBase +
          '?latitude=' + lat + '&longitude=' + lon +
          '&daily=weathercode,temperature_2m_max,temperature_2m_min,' +
          'precipitation_probability_max,windspeed_10m_max,uv_index_max' +
          '&timezone=auto&forecast_days=5';

        var gUrl = CONFIG.api.geocodeBase +
          '?lat=' + lat + '&lon=' + lon + '&format=json';

        Promise.all([
          fetch(wUrl).then(function (r) { return r.json(); }),
          fetch(gUrl, { headers: { 'Accept-Language': 'en' } }).then(function (r) { return r.json(); }),
        ]).then(function (results) {
          state.data.forecast = results[0].daily;
          var addr = results[1].address || {};
          state.data.location =
            addr.city || addr.town || addr.village || addr.county || 'Your Location';
          state.data.cachedAt = Date.now();
          saveData();
          showLoading(false);
          renderForecast();
        }).catch(function () {
          showLoading(false);
          if (state.data.forecast) {
            renderForecast();
            showToast('Using cached data', 'warning');
          } else {
            useDemoData();
          }
        });
      },
      function () {
        showLoading(false);
        if (state.data.forecast) {
          renderForecast();
          showToast('Using cached data', 'warning');
        } else {
          useDemoData();
        }
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }

  function useDemoData() {
    var today = new Date();
    state.data.location = 'Demo Mode';
    state.data.forecast = {
      time: [0, 1, 2, 3, 4].map(function (i) {
        var d = new Date(today);
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
      }),
      weathercode:                    [0,  2,  61,  3,  80],
      temperature_2m_max:             [24, 21,  18, 16,  22],
      temperature_2m_min:             [14, 13,  11, 10,  15],
      precipitation_probability_max:  [5,  20,  80, 60,  30],
      windspeed_10m_max:              [12, 18,  25, 20,  10],
      uv_index_max:                   [7,   5,   2,  3,   6],
    };
    renderForecast();
    showToast('Demo mode — location unavailable');
  }

  // ==================== RENDER ====================
  function renderForecast() {
    var fc = state.data.forecast;
    if (!fc) return;

    document.getElementById('location-label').textContent =
      state.data.location || 'Weather';

    var list = document.getElementById('forecast-list');
    list.innerHTML = '';

    fc.time.forEach(function (date, i) {
      var w = getWeather(fc.weathercode[i]);
      var btn = document.createElement('button');
      btn.className = 'day-card focusable';
      btn.dataset.action = 'open-day';
      btn.dataset.dayIndex = i;
      btn.innerHTML =
        '<span class="day-name">' + dayName(date, i) + '</span>' +
        '<span class="day-emoji">' + w.emoji + '</span>' +
        '<span class="day-desc">' + w.desc + '</span>' +
        '<span class="day-temps">' +
          '<span class="temp-h">' + fmtTemp(fc.temperature_2m_max[i]) + '</span>' +
          '<span class="temp-l">' + fmtTemp(fc.temperature_2m_min[i]) + '</span>' +
        '</span>';
      list.appendChild(btn);
    });

    list.classList.remove('hidden');
    focusFirst(screens['home']);
  }

  function renderDetail(index) {
    var fc = state.data.forecast;
    if (!fc || index < 0 || index >= fc.time.length) return;

    state.selectedDayIndex = index;
    var date = fc.time[index];
    var w    = getWeather(fc.weathercode[index]);
    var high = fc.temperature_2m_max[index];
    var low  = fc.temperature_2m_min[index];

    document.getElementById('detail-day-name').textContent = dayName(date, index);
    document.getElementById('detail-date').textContent     = shortDate(date);
    document.getElementById('detail-emoji').textContent    = w.emoji;
    document.getElementById('detail-high').textContent     = fmtTemp(high);
    document.getElementById('detail-low').textContent      = fmtTemp(low);
    document.getElementById('detail-desc').textContent     = w.desc;
    document.getElementById('detail-precip').textContent   =
      (fc.precipitation_probability_max[index] || 0) + '%';
    document.getElementById('detail-wind').textContent     =
      Math.round(fc.windspeed_10m_max[index] || 0) + ' km/h';
    document.getElementById('detail-uv').textContent       =
      Math.round(fc.uv_index_max[index] || 0);
    document.getElementById('detail-range').textContent    =
      Math.round(high - low) + '°';

    var lastIdx = fc.time.length - 1;
    var btnPrev = document.getElementById('btn-prev');
    var btnNext = document.getElementById('btn-next');
    btnPrev.classList.toggle('hidden', index === 0);
    btnNext.classList.toggle('hidden', index === lastIdx);
  }

  function goToDay(index) {
    var fc = state.data.forecast;
    if (!fc || index < 0 || index >= fc.time.length) return;
    renderDetail(index);
    showToast(dayName(fc.time[index], index));
  }

  // ==================== UI HELPERS ====================
  function showLoading(show) {
    document.getElementById('home-loading').classList.toggle('hidden', !show);
    if (show) document.getElementById('forecast-list').classList.add('hidden');
  }

  function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'toast' + (type ? ' ' + type : '');
    t.offsetHeight; // force reflow
    t.classList.add('visible');
    setTimeout(function () { t.classList.remove('visible'); }, 2500);
  }

  // ==================== PERSISTENCE ====================
  function loadData() {
    try {
      var raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved.cachedAt && Date.now() - saved.cachedAt < CONFIG.api.cacheDuration) {
        Object.assign(state.data, saved);
      }
    } catch (e) { /* ignore */ }
  }

  function saveData() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.data));
    } catch (e) { /* ignore */ }
  }

  // ==================== ACTIONS ====================
  function handleAction(action, el) {
    switch (action) {
      case 'back':
        navigateBack();
        break;
      case 'refresh':
        state.data.forecast = null;
        state.data.cachedAt = null;
        document.getElementById('forecast-list').classList.add('hidden');
        fetchWeather();
        break;
      case 'open-day':
        var idx = parseInt(el.dataset.dayIndex, 10);
        renderDetail(idx);
        navigateTo('detail');
        break;
      case 'prev-day':
        goToDay(state.selectedDayIndex - 1);
        break;
      case 'next-day':
        goToDay(state.selectedDayIndex + 1);
        break;
    }
  }

  function onScreenEnter(screenId) {
    if (screenId === 'home') {
      if (!state.data.forecast) {
        fetchWeather();
      } else {
        renderForecast();
      }
    }
  }

  // ==================== EVENTS ====================
  function setupEvents() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-action]');
      if (el) handleAction(el.dataset.action, el);
    });

    document.addEventListener('keydown', function (e) {
      switch (e.key) {
        case 'ArrowUp':    moveFocus('up');    e.preventDefault(); break;
        case 'ArrowDown':  moveFocus('down');  e.preventDefault(); break;
        case 'ArrowLeft':  moveFocus('left');  e.preventDefault(); break;
        case 'ArrowRight': moveFocus('right'); e.preventDefault(); break;
        case 'Enter':
          if (document.activeElement &&
              document.activeElement.classList.contains('focusable')) {
            document.activeElement.click();
          }
          e.preventDefault();
          break;
        case 'Escape':
          navigateBack();
          e.preventDefault();
          break;
      }
    });
  }

  // ==================== INIT ====================
  function init() {
    collectScreens();
    setupEvents();
    loadData();
    setTimeout(function () {
      navigateTo('home', { addToHistory: false });
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
