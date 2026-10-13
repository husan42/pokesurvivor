/* ============ raid-ui.js — pantalla de la incursión ============
 * El legendario de la semana (cuánto falta para que cambie y sus premios), la práctica contra
 * los legendarios que ya has vencido y el ranking semanal (más rápido, solo y en grupo).
 * Se empieza en solitario o, si eres el anfitrión de una sala con amigos, con toda la sala.
 */
G.RaidUI = (() => {
  const $ = id => document.getElementById(id);
  let sel = null, group = false;

  function left(ms) {
    const h = Math.max(0, Math.floor(ms / 3600e3));
    return h >= 24 ? Math.floor(h / 24) + ' d ' + (h % 24) + ' h' : h + ' h';
  }

  /** Legendarios para practicar: el de la semana primero y luego los vencidos. */
  function practiceList(wk) {
    const s = G.DB.save || {};
    const beaten = Object.keys(s.legends || {}).map(Number).filter(d => d !== wk.dex && G.DEX_BY[d] && G.SPRITE_META[d]);
    return [wk.dex].concat(beaten.sort((a, b) => a - b));
  }

  function open() {
    sel = null;
    render();
    G.UI.show('scr-raid', true);
  }

  function render() {
    const wk = G.Raid.weekly();
    if (sel == null) sel = wk.dex;
    const weekly = sel === wk.dex, mon = G.DEX_BY[sel];
    const s = G.DB.save || {}, best = s.raid && s.raid.best && s.raid.best[sel];
    const stage = $('raid-stage');
    stage.innerHTML = '';
    stage.appendChild(G.UI.spriteCanvas(sel, 220, 200, { lively: true, scale: 2, hero: true }));
    $('raid-name').textContent = mon.name;
    $('raid-types').innerHTML = mon.types.map(t => `<span class="tag-chip" style="background:${G.U.TYPE_COLOR[t]}">${G.U.TYPE_NAME[t]}</span>`).join(' ');
    $('raid-week').textContent = weekly ? 'Legendario de la semana · cambia en ' + left(wk.ends - Date.now())
                                        : 'Práctica: sin premio semanal ni ranking';
    const cleared = s.raid && s.raid.weekClear === wk.id;
    const chance = Math.round((weekly ? G.Raid.CHANCE_WEEK : G.Raid.CHANCE) * 100);
    $('raid-rewards').innerHTML =
      `<div>${G.Icons.html('ticket', 14)} ×3 y monedas por victoria (más cuanto más rápido)</div>` +
      `<div>${chance} % de conseguir a ${mon.name}${G.DB.owns(sel) ? ' (ya lo tienes: ' + G.Icons.html('ticket10', 14) + ' ×1)' : ''}</div>` +
      (weekly ? `<div>${cleared ? '✔ Premio semanal conseguido' : G.Icons.html('ticket10', 14) + ' ×1 extra la primera victoria de la semana'}</div>` : '') +
      (best ? `<div>Tu mejor tiempo: ${G.U.mmss(best)}</div>` : '') +
      `<div class="muted">5 minutos · 3 fases · los últimos 30 s se enfurece</div>`;

    const room = G.Social.room;
    const host = room && room.isHost && room.members.length >= 2;
    $('raid-solo').classList.toggle('hidden', !!room);
    $('raid-group').classList.toggle('hidden', !host);
    $('raid-note').textContent = room && !host ? (room.isHost ? 'Necesitas al menos un amigo en la sala.' : 'El anfitrión de la sala empieza la incursión.') : '';
    $('raid-solo').onclick = () => { G.UI.hide('scr-raid'); G.Game.startRun(null, G.Raid.makeCfg(sel)); };
    $('raid-group').onclick = () => { G.UI.hide('scr-raid'); G.LobbyUI.start({ raid: G.Raid.makeCfg(sel) }); };

    // Práctica
    const pr = $('raid-practice');
    pr.innerHTML = '';
    for (const d of practiceList(wk)) {
      const b = document.createElement('button');
      b.className = 'raid-pick' + (d === sel ? ' on' : '');
      b.appendChild(G.UI.spriteCanvas(d, 64, 56, { scale: 1 }));
      b.insertAdjacentHTML('beforeend', `<small>${G.DEX_BY[d].name}</small>${d === wk.dex ? '<i>Semana</i>' : ''}`);
      b.onclick = () => { sel = d; G.Audio.sfx('click'); render(); };
      pr.appendChild(b);
    }
    if (practiceList(wk).length < 2) pr.insertAdjacentHTML('beforeend', '<p class="note">Vence legendarios (en grietas o incursiones) para poder practicar contra ellos.</p>');

    // Ranking
    document.querySelectorAll('#raid-board-tabs button').forEach(bt => {
      bt.classList.toggle('on', +bt.dataset.g === (group ? 1 : 0));
      bt.onclick = () => { group = bt.dataset.g === '1'; render(); };
    });
    loadBoard(wk);
  }

  async function loadBoard(wk) {
    const box = $('raid-board');
    if (!G.DB.online) { box.innerHTML = '<p class="note">Inicia sesión con una cuenta para ver el ranking.</p>'; return; }
    box.innerHTML = '<p class="note">Cargando…</p>';
    const rows = await G.RaidRank.top(wk.id, wk.dex, group, 10);
    if (!rows) { box.innerHTML = '<p class="note">No se ha podido cargar el ranking.</p>'; return; }
    if (!rows.length) { box.innerHTML = '<p class="note">Todavía nadie ha vencido al legendario de esta semana.</p>'; return; }
    const me = G.DB.fb && G.DB.fb.uid;
    box.innerHTML = rows.map((r, i) => `<div class="raid-row${r.uids.includes(me) ? ' me' : ''}"><b>${i + 1}</b>
      <span translate="no">${r.names.map(n => String(n).replace(/[<>&]/g, '')).join(' · ')}</span><em>${G.U.mmss(r.t)}</em></div>`).join('');
  }

  return { open };
})();
