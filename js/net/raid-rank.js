/* ============ raid-rank.js — ranking de la incursión (versión local) ============
 * "Más rápido contra el legendario de la semana", en solitario y en grupo.
 *   raid/{semana}_{dex}_{s|g}/e/{id}   { t (s), uids, names, dex, at }
 *   id: tu uid (solo) o los uids ordenados unidos con "_" (grupo; lo sube el anfitrión)
 * Sólo se guarda si mejora la marca (también lo exige firestore.rules). Mínimo 20 s.
 */
G.RaidRank = (() => {
  const MIN_T = 20;
  const board = (week, dex, group) => week + '_' + dex + '_' + (group ? 'g' : 's');
  const fb = () => (G.DB.online ? G.DB.fb : null);
  const col = b => fb().fs.collection('raid').doc(b).collection('e');

  /** @param members  [{uid, name, dex}] en grupo; null en solitario. → { better, t } o null */
  async function submit(week, dex, secs, members) {
    const f = fb();
    if (!f || secs < MIN_T) return null;
    const group = !!(members && members.length > 1);
    const ms = group ? members.slice().sort((a, b) => (a.uid < b.uid ? -1 : 1))
                     : [{ uid: f.uid, name: G.Social.me ? G.Social.me.name : (G.DB.user || '?'), dex: G.DB.save.partner }];
    const id = ms.map(m => m.uid).join('_');
    try {
      const ref = col(board(week, dex, group)).doc(id);
      const old = await ref.get();
      if (old.exists && old.data().t <= secs) return { better: false, t: old.data().t };
      await ref.set({ t: secs, uids: ms.map(m => m.uid), names: ms.map(m => m.name), dex: ms.map(m => m.dex),
                      at: firebase.firestore.FieldValue.serverTimestamp() });
      return { better: true, t: secs };
    } catch (e) { console.warn('[RaidRank]', e.code || e.message); return null; }
  }

  /** Las n mejores marcas (más rápidas primero). */
  async function top(week, dex, group, n = 10) {
    const f = fb();
    if (!f) return null;
    try {
      const snap = await col(board(week, dex, group)).orderBy('t').limit(n).get();
      return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    } catch (e) { console.warn('[RaidRank]', e.code || e.message); return null; }
  }

  return { submit, top, MIN_T };
})();
