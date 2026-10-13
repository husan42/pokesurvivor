/* ============ raid.js — incursión (combate cooperativo contra un legendario) ============
 * Versión local. Ver docs/RAID.md.
 *
 * Una partida "incursión" empieza directamente en la arena de la grieta (rift.js) contra
 * un legendario con 3 fases (enemy.js, this.raid), de 1 a 4 jugadores:
 *   - preparación: 6 cartas de nivel nada más empezar (como a mitad de una run normal);
 *   - 5 minutos; los últimos 30 s, furia; esbirros al cambiar de fase;
 *   - al acabar, ganes o pierdas, se termina la partida (no se vuelve al mapa).
 *
 * El legendario de la semana es el mismo en todos los dispositivos: se elige con la semana
 * ISO (hora de Taiwán) como semilla. Premios (cada jugador los suyos):
 *   victoria   3 tickets + monedas (más cuanto más rápido) y, con probabilidad baja
 *              (5 %, 10 % el de la semana), ese legendario (si ya lo tienes, 1 ticket ×10);
 *              primera victoria de la semana contra el de la semana: +1 ticket ×10
 *   derrota    algunas monedas según el daño hecho
 * Monedas y tickets con los multiplicadores de Ajustes > Recompensas.
 *
 * Red: el anfitrión decide (fases, furia, fin). Mensajes: 'raidp' fase · 'raidb' furia.
 */
G.Raid = (() => {
  const TIME = 300, ARENA_R = 11, PREP_LEVELS = 6;
  const BASE_HP = 7000, NK = [1, 1.7, 2.3, 2.9];
  const CHANCE = 0.05, CHANCE_WEEK = 0.10;
  let cfg = null, phase = 1;

  function reset() { cfg = null; phase = 1; }

  // ---------------- semana y legendario de la semana ----------------

  /** Semana ISO en hora de Taiwán (UTC+8): { id: '2026-42', ends: ms del próximo lunes 00:00 }. */
  function week(now = Date.now()) {
    const tw = new Date(now + 8 * 3600e3);
    const d = new Date(Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const y = d.getUTCFullYear();
    const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
    const monday = Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), tw.getUTCDate()) - (day - 1) * 864e5;
    return { id: y + '-' + String(w).padStart(2, '0'), ends: monday + 7 * 864e5 - 8 * 3600e3 };
  }

  /** Legendarios con sprites, en orden de Pokédex. */
  function pool() { return G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]).sort((a, b) => a.dex - b.dex); }

  function weekly() {
    const wk = week(), p = pool();
    let h = 2166136261;
    for (const c of 'raid:' + wk.id) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return { id: wk.id, ends: wk.ends, dex: p[h % p.length].dex };
  }

  /** Configuración de una incursión contra `dex` (la elige quien la empieza). */
  function makeCfg(dex) {
    const mon = G.DEX_BY[dex], wk = weekly();
    return {
      raid: true, dex, week: wk.id, weekly: dex === wk.dex, time: TIME, r: ARENA_R,
      tx: 5000 + Math.floor(Math.random() * 3000), ty: 5000 + Math.floor(Math.random() * 3000),
      shiny: G.Sprites.hasShiny(dex) && Math.random() < 1 / 512,
      type: G.U.pick(mon.types)
    };
  }

  const bossHp = n => Math.round(BASE_HP * NK[G.U.clamp(n, 1, 4) - 1]);

  // ---------------- partida ----------------

  /** Lo llama Game.startRun después de crear al jugador. */
  function start(rc) {
    cfg = rc; phase = 1;
    if (!G.Coop.active || G.Coop.isHost) {
      G.Game.grantLevels(PREP_LEVELS);
      G.Rift.startRaid(rc);
    }
    G.Spawner.say('¡Prepárate! Elige tus mejoras antes del combate', 3, true);
  }

  /** Cambio de fase del legendario (sólo en quien manda; enemy.js). */
  function onPhase(f, boss) {
    if (G.Coop.isHost) G.Coop.broadcast(['raidp', f]);
    sayPhase(f);
    const n = Math.max(1, G.Game.everyone().length);
    G.Spawner.spawnNear(boss.x, boss.y, (f === 2 ? 4 : 6) + 2 * (n - 1), f === 2 ? 120 : 240);
  }
  function sayPhase(f) {
    phase = f;
    G.Spawner.say(f === 2 ? '¡Fase 2! El legendario llama a sus esbirros' : '¡Fase 3! ¡El legendario está desatado!', 3, true);
    G.Camera.kick(0.7);
    G.Audio.sfx('boss');
  }

  function onBerserk() {
    if (G.Coop.isHost) G.Coop.broadcast(['raidb']);
    G.Spawner.say('¡Quedan 30 segundos! El legendario se enfurece', 3, true);
    G.Audio.sfx('boss');
  }

  function onEvent(ev) {
    if (ev[0] === 'raidp') sayPhase(ev[1]);
    else if (ev[0] === 'raidb') { G.Spawner.say('¡Quedan 30 segundos! El legendario se enfurece', 3, true); G.Audio.sfx('boss'); }
  }

  /** Fin de la incursión (en cada dispositivo): premios y resumen. */
  function finish(win, a) {
    const info = rewards(win, a);
    // Ranking: sólo el legendario de la semana. En grupo lo sube el anfitrión, con todos.
    if (win && a.weekly && (!G.Coop.active || G.Coop.isHost)) {
      const ms = G.Coop.active ? G.Coop.members.map(m => ({ uid: m.uid, name: m.name, dex: m.dex })) : null;
      G.RaidRank.submit(a.week, a.dex, info.secs, ms).then(r => {
        if (r && r.better) G.UI.toast('¡Nueva mejor marca en el ranking de la incursión! ' + G.U.mmss(r.t));
      });
    }
    G.Game.endRun(!win, { raid: info });
  }

  function rewards(win, a) {
    const s = G.DB.save;
    const info = { win, dex: a.dex, secs: Math.floor(a.wonAt || a.t), weekly: !!a.weekly, coins: 0, t1: 0, t10: 0, legend: null };
    if (!s) return info;
    s.tickets = s.tickets || { t1: 0, t10: 0 };
    s.raid = s.raid || { plays: 0, wins: 0, best: {}, weekClear: '' };
    s.raid.plays++;
    const cm = G.Settings.mul('rwCoins'), tm = G.Settings.mul('rwTickets');
    if (win) {
      s.raid.wins++;
      const prev = s.raid.best[a.dex];
      if (!prev || info.secs < prev) s.raid.best[a.dex] = info.secs;
      s.legends = s.legends || {};
      s.legends[a.dex] = s.legends[a.dex] || Date.now();
      info.coins = Math.round(Math.max(150, 900 - info.secs * 2) * cm);
      info.t1 = Math.round(3 * tm);
      if (Math.random() < (a.weekly ? CHANCE_WEEK : CHANCE)) {
        if (!G.DB.owns(a.dex)) { G.DB.grant(a.dex, 'raid'); info.legend = 'new'; }
        else { info.t10 += Math.max(1, Math.round(tm)); info.legend = 'dupe'; }
        if (a.shiny && G.DB.grantShiny(a.dex, 'raid')) info.legend = 'shiny';
      }
      if (a.weekly && s.raid.weekClear !== a.week) {
        s.raid.weekClear = a.week;
        info.t10 += Math.max(1, Math.round(tm));
        info.weekFirst = true;
      }
    } else {
      // Derrota: monedas según la vida que le quitasteis.
      const boss = G.EnemyMgr.all().find(e => e.boss);
      const done = boss ? G.U.clamp(1 - boss.hp / boss.maxHp, 0, 1) : 0;
      info.coins = Math.round(250 * done * cm);
    }
    s.tickets.t1 += info.t1;
    s.tickets.t10 += info.t10;
    return info;
  }

  return {
    reset, start, finish, onPhase, onBerserk, onEvent, bossHp, makeCfg, weekly, week, pool,
    TIME, CHANCE, CHANCE_WEEK,
    get active() { return !!cfg; }, get cfg() { return cfg; }, get phase() { return phase; }
  };
})();
