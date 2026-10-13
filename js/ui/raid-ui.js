/* ============ raid-ui.js — pantalla de la incursión ============
 * El legendario de la semana (cuánto falta para que cambie y sus premios) y empezar
 * en solitario o, si eres el anfitrión de una sala con amigos, con toda la sala.
 */
G.RaidUI = (() => {
  const $ = id => document.getElementById(id);

  function left(ms) {
    const h = Math.max(0, Math.floor(ms / 3600e3));
    return h >= 24 ? Math.floor(h / 24) + ' d ' + (h % 24) + ' h' : h + ' h';
  }

  function open() {
    const wk = G.Raid.weekly(), mon = G.DEX_BY[wk.dex];
    const s = G.DB.save || {}, best = s.raid && s.raid.best && s.raid.best[wk.dex];
    const stage = $('raid-stage');
    stage.innerHTML = '';
    stage.appendChild(G.UI.spriteCanvas(wk.dex, 220, 200, { lively: true, scale: 2, hero: true }));
    $('raid-name').textContent = mon.name;
    $('raid-types').innerHTML = mon.types.map(t => `<span class="tag-chip" style="background:${G.U.TYPE_COLOR[t]}">${G.U.TYPE_NAME ? G.U.TYPE_NAME[t] : t}</span>`).join(' ');
    $('raid-week').textContent = 'Legendario de la semana · cambia en ' + left(wk.ends - Date.now());
    const cleared = s.raid && s.raid.weekClear === wk.id;
    $('raid-rewards').innerHTML =
      `<div>${G.Icons.html('ticket', 14)} ×3 y monedas por victoria (más cuanto más rápido)</div>` +
      `<div>${Math.round(G.Raid.CHANCE_WEEK * 100)} % de conseguir a ${mon.name}${G.DB.owns(wk.dex) ? ' (ya lo tienes: ' + G.Icons.html('ticket10', 14) + ' ×1)' : ''}</div>` +
      `<div>${cleared ? '✔ Premio semanal conseguido' : G.Icons.html('ticket10', 14) + ' ×1 extra la primera victoria de la semana'}</div>` +
      (best ? `<div>Tu mejor tiempo: ${G.U.mmss(best)}</div>` : '') +
      `<div class="muted">5 minutos · 3 fases · los últimos 30 s se enfurece</div>`;
    const room = G.Social.room;
    const host = room && room.isHost && room.members.length >= 2;
    $('raid-solo').classList.toggle('hidden', !!room);
    $('raid-group').classList.toggle('hidden', !host);
    $('raid-note').textContent = room && !host ? (room.isHost ? 'Necesitas al menos un amigo en la sala.' : 'El anfitrión de la sala empieza la incursión.') : '';
    $('raid-solo').onclick = () => { G.UI.hide('scr-raid'); G.Game.startRun(null, G.Raid.makeCfg(wk.dex)); };
    $('raid-group').onclick = () => { G.UI.hide('scr-raid'); G.LobbyUI.start({ raid: G.Raid.makeCfg(wk.dex) }); };
    G.UI.show('scr-raid', true);
  }

  return { open };
})();
