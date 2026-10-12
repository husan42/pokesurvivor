/* ============ settings.js — ajustes de este dispositivo ============
 * Se guardan en el navegador (no en la cuenta): cada PC o móvil tiene los
 * suyos. El volumen lo guarda audio.js aparte.
 *
 *   quality     'auto' | 'high' | 'mid' | 'low'   efectos y partículas
 *   dmgNumbers  true/false                        números de daño
 *   calm        true/false                        menos sacudidas y destellos
 *   fps         true/false                        contador de FPS
 *   stick       0.8 | 1 | 1.25                    tamaño del joystick táctil
 *   zoom        null | 's' | 'm' | 'l'            tamaño de la vista (null: 'm' en táctil, 's' en PC)
 *   rwCoins / rwTickets / rwXp / rwShiny   1..10  multiplicadores de recompensas
 *               (versión local: monedas, tickets, experiencia y probabilidad de shiny)
 *
 *   G.Settings.get('quality')  ·  G.Settings.set('fps', true)  ·  G.Settings.on(fn)
 *   G.Settings.fx   nivel efectivo 0 (bajo) .. 2 (alto), ya resuelto el 'auto'
 */
G.Settings = (() => {
  const KEY = 'ps.settings';
  const DEF = { quality: 'auto', dmgNumbers: true, calm: false, fps: false, stick: 1,
               zoom: null, rwCoins: 1, rwTickets: 1, rwXp: 1, rwShiny: 1 };
  let s = Object.assign({}, DEF);
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* nada */ }
  const fns = new Set();

  // Calidad automática: empieza alta (media en móvil) y baja si va a tirones.
  const touchy = matchMedia('(pointer: coarse)').matches;
  let autoLevel = touchy ? 1 : 2;
  let acc = 0, frames = 0, slowT = 0, fastT = 0;

  function save() { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* nada */ } }
  function get(k) { return s[k]; }
  function set(k, v) { s[k] = v; save(); fns.forEach(fn => { try { fn(k, v); } catch (e) { /* nada */ } }); }

  /** Lo llama el bucle del juego en cada fotograma (sólo durante la partida). */
  function sample(dt) {
    if (s.quality !== 'auto' || dt <= 0) return;
    acc += dt; frames++;
    if (acc < 1) return;
    const fps = frames / acc;
    acc = 0; frames = 0;
    // 3 s seguidos por debajo de 45 FPS: baja un nivel; 8 s por encima de 57: sube.
    if (fps < 45) { slowT++; fastT = 0; } else if (fps > 57) { fastT++; slowT = 0; } else { slowT = fastT = 0; }
    if (slowT >= 3 && autoLevel > 0) { autoLevel--; slowT = 0; }
    if (fastT >= 8 && autoLevel < (touchy ? 1 : 2)) { autoLevel++; fastT = 0; }
  }

  // Multiplicadores de recompensas.
  function mul(k) { const v = +s[k]; return isFinite(v) && v > 0 ? v : 1; }
  /** ¿Sale? Probabilidad base × multiplicador (tope 1). */
  function chance(rate, k) { return Math.random() < Math.min(1, rate * mul(k)); }
  /** Cuántos salen: la media es probabilidad base × multiplicador (puede pasar de 1). */
  function rolls(rate, k) { const e = rate * mul(k); const n = Math.floor(e); return n + (Math.random() < e - n ? 1 : 0); }

  return {
    get, set, sample, DEF, mul, chance, rolls,
    on(fn) { fns.add(fn); },
    get all() { return Object.assign({}, s); },
    get fx() { return s.quality === 'auto' ? autoLevel : s.quality === 'high' ? 2 : s.quality === 'mid' ? 1 : 0; },
    get autoLevel() { return autoLevel; },
    /** Tamaño de la vista: 's' como el original, 'm' ×1,3 y 'l' ×1,6 (en táctil, 'm' por defecto). */
    get zoomKey() { return ['s', 'm', 'l'].includes(s.zoom) ? s.zoom : touchy ? 'm' : 's'; },
    get zoom() { return { s: 1, m: 1.3, l: 1.6 }[this.zoomKey]; },
    get touch() { return touchy; }
  };
})();
