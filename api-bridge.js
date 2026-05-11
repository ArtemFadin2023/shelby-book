/**
 * shelby-book — API Bridge v1
 * Подключи этот файл ПЕРЕД admin-shelby-x7k2.html и index.html
 * 
 * Работает как прозрачная прокладка:
 * - Читает данные с сервера (api.php?action=load)
 * - При записи — сохраняет и локально, и на сервер
 * - index.html (публичная часть) — только читает с сервера
 * - admin-shelby-x7k2.html — читает и пишет через API
 */

(function() {
  'use strict';

  // ─── Настройки ───────────────────────────────────────────────
  const API_URL = './api.php';   // путь к api.php (тот же каталог)
  const IS_ADMIN = window.location.pathname.includes('admin-shelby-x7k2');
  
  // ─── Кэш данных с сервера ─────────────────────────────────────
  window.__serverData = {};
  window.__serverDataLoaded = false;
  window.__serverDataPromise = null;

  // ─── Пароль текущего сеанса (используется для API-вызовов) ───
  window.__adminPass = null;

  // ─── Загрузка всех данных с сервера ───────────────────────────
  window.loadServerData = function() {
    if (window.__serverDataPromise) return window.__serverDataPromise;
    
    window.__serverDataPromise = fetch(API_URL + '?action=load&t=' + Date.now())
      .then(r => r.json())
      .then(res => {
        if (res.ok) {
          window.__serverData = res.data || {};
          // Синхронизируем в localStorage как кэш
          Object.entries(window.__serverData).forEach(([k, v]) => {
            try {
              if (typeof v === 'string') localStorage.setItem(k, v);
              else localStorage.setItem(k, JSON.stringify(v));
            } catch(e) {}
          });
        }
        window.__serverDataLoaded = true;
        return window.__serverData;
      })
      .catch(err => {
        console.warn('[shelby] API недоступен, используем localStorage:', err);
        window.__serverDataLoaded = true;
        return {};
      });

    return window.__serverDataPromise;
  };

  // ─── Отправка данных на сервер ────────────────────────────────
  window.saveToServer = function(key, value, urgent = false) {
    if (!IS_ADMIN) return Promise.resolve();
    const pass = window.__adminPass;
    if (!pass) return Promise.resolve(); // не авторизованы
    
    const payload = JSON.stringify({ pass, key, value });
    
    // Для срочных (изображения, важные данные) — fetch с await
    // Для остальных — fire-and-forget
    const req = fetch(API_URL + '?action=save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).then(r => r.json()).catch(e => {
      console.warn('[shelby] Ошибка сохранения:', key, e);
    });
    
    return urgent ? req : req;
  };

  // ─── Пакетное сохранение всех секций ─────────────────────────
  window.saveAllToServer = function(dataObj, imagesObj) {
    if (!IS_ADMIN) return Promise.resolve();
    const pass = window.__adminPass;
    if (!pass) return Promise.resolve();
    
    return fetch(API_URL + '?action=save_all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass, data: dataObj, images: imagesObj }),
    })
    .then(r => r.json())
    .catch(e => { console.warn('[shelby] save_all error:', e); });
  };

  // ─── API: смена пароля ────────────────────────────────────────
  window.apiChangePassword = function(oldPass, newPass) {
    const passData = JSON.parse(localStorage.getItem('sb_admin_creds') || 'null');
    const user = passData?.user || 'shelby';
    
    return fetch(API_URL + '?action=change_pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_pass: oldPass, new_pass: newPass, user }),
    }).then(r => r.json());
  };

  // ─── API: логин ───────────────────────────────────────────────
  window.apiLogin = function(user, pass) {
    return fetch(API_URL + '?action=verify_pass', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass }),
    }).then(r => r.json())
    .catch(() => {
      // fallback к дефолтным данным если API недоступен
      return { ok: (user === 'shelby' && pass === 'agama2026') };
    });
  };

  // ─── API: сброс данных ────────────────────────────────────────
  window.apiReset = function(pass) {
    return fetch(API_URL + '?action=reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass }),
    }).then(r => r.json());
  };

  // ─── Сразу начинаем загрузку данных с сервера ────────────────
  window.loadServerData();

})();