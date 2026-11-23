/* EnviroOS — COMMUNITY DATA layer ("EnviroChat").
 * Offline-first store for farmer posts, threaded replies, votes, reports
 * and bookmarks. No DOM rendering here.
 *
 *   Supabase configured + online -> shared with all farmers (supabase/community.sql)
 *   Supabase configured + offline -> cached copy + write queue, replayed later
 *   Supabase not configured        -> local-only on this phone (stated in UI)
 *
 * Client generates uuid ids, so queued writes replay idempotently.
 * Emits `community-change` and `community-updated` on document whenever data changes.
 */
'use strict';
window.EnviroOS = window.EnviroOS || {};
(function () {
  const E = EnviroOS;

  const K = {
    me: 'enviroos.comm.me',
    posts: 'enviroos.comm.posts',
    comments: 'enviroos.comm.comments',
    queue: 'enviroos.comm.queue',
    votes: 'enviroos.comm.votes',
    saved: 'enviroos.comm.saved',
    hidden: 'enviroos.comm.hidden',
    syncedAt: 'enviroos.comm.syncedAt'
  };
  const TOPICS = ['water', 'pests', 'fertilizer', 'mandi', 'weather', 'equipment', 'general'];
  const MAX_CACHE_POSTS = 150;

  const load = (k, fb) => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch (_) { return fb; } };
  const save = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (_) {
      // Quota: drop photos from the oldest cached posts and retry once.
      if (k === K.posts && Array.isArray(v)) {
        v.slice(40).forEach((p) => { if (!p._pending) { p.image = null; p.photo_url = null; } });
        try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (__) { /* give up */ }
      }
      return false;
    }
  };
  const uuid = () => {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) { /* fall through */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  };
  const online = () => { try { return navigator.onLine !== false; } catch (_) { return true; } };
  const emit = (detail) => {
    try {
      document.dispatchEvent(new CustomEvent('community-change', { detail: detail || {} }));
      document.dispatchEvent(new CustomEvent('community-updated', { detail: detail || {} }));
    } catch (_) { /* ignore */ }
  };

  const PINNED_GUIDES = [
    {
      id: 'pinned-guide-welcome',
      author_id: 'agri-guide',
      author_name: 'Agri',
      author_village: '',
      crop_id: 'bajra',
      topic: 'general',
      title: 'How to get the fastest help on EnviroChat',
      body: '1. Pick a topic (Water, Pests, Fertilizer, Mandi). 2. Tap the mic to speak your question in your own language. 3. Turn on "Attach My Live Field Readings" or add a clear leaf photo so other farmers and Agri can see your exact soil moisture, NPK, and crop stage.',
      is_pinned: true,
      score: 12,
      upvotes: 12,
      comment_count: 0,
      created_at: new Date(Date.now() - 3600 * 1000).toISOString()
    },
    {
      id: 'pinned-guide-yellowing',
      author_id: 'agri-guide',
      author_name: 'Agri',
      author_village: '',
      crop_id: 'wheat',
      topic: 'pests',
      title: 'When leaves curl or turn yellow: 3-step field check',
      body: 'Before spraying anything: (1) Check soil moisture first — both drought (<15%) and waterlogging (>35%) cause yellowing. (2) Look under the leaf for aphids, whiteflies, or mites. (3) If older bottom leaves yellow first, Nitrogen may be low; if new top leaves yellow, check soil pH and micronutrients.',
      is_pinned: true,
      score: 9,
      upvotes: 9,
      comment_count: 0,
      created_at: new Date(Date.now() - 7200 * 1000).toISOString()
    }
  ];

  // ---------- state ----------
  let posts = load(K.posts, []);            // newest first
  let comments = load(K.comments, {});      // postId -> [comment]
  let queue = load(K.queue, []);            // [{op, ...}]
  let votes = load(K.votes, {});            // 'post:id' -> -1|0|1
  let saved = load(K.saved, []);            // [postId]
  let hidden = load(K.hidden, []);          // [id] reported by me
  let flushing = false;
  let lastError = null;

  const persist = () => {
    posts = posts.slice(0, MAX_CACHE_POSTS);
    save(K.posts, posts);
    save(K.comments, comments);
    save(K.queue, queue);
  };

  // ---------- identity ----------
  function me() {
    const m = load(K.me, null);
    if (m && m.id) return m;
    const fresh = { id: uuid(), name: '', village: '', cropId: '' };
    save(K.me, fresh);
    return fresh;
  }
  function hasMe() { const m = me(); return !!(m.name && m.name.trim()); }
  function setMe(patch) {
    const m = Object.assign(me(), patch || {});
    m.name = String(m.name || '').trim().slice(0, 40);
    m.village = String(m.village || '').trim().slice(0, 60);
    save(K.me, m);
    emit({ kind: 'me' });
    return m;
  }

  // ---------- cloud ----------
  function cloud() {
    const sb = E.supabase;
    if (!sb || !sb.isConfigured || !sb.isConfigured()) return null;
    const url = String((sb.config && sb.config.url) || '').trim().replace(/\/+$/, '');
    const key = String((sb.config && sb.config.anonKey) || '').trim();
    if (!url || !key) return null;
    return { url, key };
  }
  function headers(c, extra) {
    return Object.assign({ 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + c.key }, extra || {});
  }
  async function req(path, opts) {
    const c = cloud();
    if (!c) throw new Error('not-configured');
    const ctl = new AbortController();
    const to = setTimeout(() => { try { ctl.abort(); } catch (_) { /* ignore */ } }, 12000);
    try {
      const res = await fetch(c.url + '/rest/v1/' + path, Object.assign({}, opts, { headers: headers(c, opts && opts.headers), signal: ctl.signal }));
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const j = await res.json(); msg = j.message || j.hint || msg; } catch (_) { /* ignore */ }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      const txt = await res.text();
      return txt ? JSON.parse(txt) : null;
    } finally { clearTimeout(to); }
  }

  function mode() {
    if (!cloud()) return 'local';
    return online() ? 'cloud' : 'offline';
  }

  // Pending score deltas from queued votes (so refresh doesn't hide my tap).
  function pendingVoteDelta(type, id) {
    let d = 0;
    for (const q of queue) if (q.op === 'vote' && q.type === type && q.id === id) d += q.delta || 0;
    return d;
  }

  function decoratePost(p) {
    if (!p) return null;
    const v = votes['post:' + p.id] || 0;
    const baseScore = p.is_pinned ? (p.score || 0) + v : (p.score != null ? p.score : (p.upvotes || 0));
    const cList = comments[p.id] || [];
    const cCount = Math.max(Number(p.comment_count || 0), cList.length);
    return Object.assign({}, p, {
      score: baseScore,
      upvotes: baseScore,
      photo_url: p.photo_url || p.image || null,
      image: p.image || p.photo_url || null,
      region_prefix: p.region_prefix || p.region || null,
      region: p.region || p.region_prefix || null,
      comment_count: cCount
    });
  }

  // ---------- reads ----------
  function listPosts(opts) {
    opts = opts || {};
    const hid = new Set(hidden);
    const guides = PINNED_GUIDES.map(decoratePost);
    const userPosts = posts.filter((p) => !hid.has(p.id)).map(decoratePost);
    let list = guides.concat(userPosts);

    if (opts.topic && opts.topic !== 'all') {
      list = list.filter((p) => p.topic === opts.topic);
    }
    if (opts.search && String(opts.search).trim()) {
      const q = String(opts.search).trim().toLowerCase();
      list = list.filter((p) =>
        String(p.title || '').toLowerCase().includes(q) ||
        String(p.body || '').toLowerCase().includes(q) ||
        String(p.author_name || '').toLowerCase().includes(q) ||
        String(p.author_village || '').toLowerCase().includes(q) ||
        String(p.crop_id || '').toLowerCase().includes(q)
      );
    }
    const sort = opts.sort || 'hot';
    if (sort === 'saved') {
      const sv = new Set(saved);
      list = list.filter((p) => sv.has(p.id));
    } else if (sort === 'crop' && opts.cropId) {
      list = list.filter((p) => p.is_pinned || p.crop_id === opts.cropId || p.author_crop === opts.cropId);
    } else if (sort === 'region' && opts.regionPrefix) {
      list = list.filter((p) => p.is_pinned || !p.region || p.region === opts.regionPrefix);
    }

    const pinned = list.filter((p) => p.is_pinned);
    const rest = list.filter((p) => !p.is_pinned);
    if (sort === 'new') {
      rest.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sort === 'top') {
      rest.sort((a, b) => (b.score || 0) - (a.score || 0) || (new Date(b.created_at) - new Date(a.created_at)));
    } else {
      // Hot: score + comments weighted against age in hours
      rest.sort((a, b) => {
        const ageA = Math.max(1, (Date.now() - new Date(a.created_at).getTime()) / 3600000);
        const ageB = Math.max(1, (Date.now() - new Date(b.created_at).getTime()) / 3600000);
        const hotA = ((a.score || 0) * 2 + (a.comment_count || 0) * 1.5 + 2) / Math.pow(ageA + 2, 1.25);
        const hotB = ((b.score || 0) * 2 + (b.comment_count || 0) * 1.5 + 2) / Math.pow(ageB + 2, 1.25);
        return hotB - hotA;
      });
    }
    return pinned.concat(rest);
  }

  function getPost(id) {
    const g = PINNED_GUIDES.find((p) => p.id === id);
    if (g) return decoratePost(g);
    const found = posts.find((p) => p.id === id);
    return found ? decoratePost(found) : null;
  }

  function getComments(postId) {
    const hid = new Set(hidden);
    return (comments[postId] || []).filter((c) => !hid.has(c.id)).map((c) => Object.assign({}, c, {
      upvotes: c.score != null ? c.score : (c.upvotes || 0),
      score: c.score != null ? c.score : (c.upvotes || 0)
    }));
  }

  let refreshing = null;
  async function refresh() {
    if (mode() !== 'cloud') { emit({ kind: 'posts' }); return listPosts(); }
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        await flush();
        const cols = 'id,author_id,author_name,author_village,author_crop,region,crop_id,topic,title,body,image,readings,lang,score,comment_count,created_at';
        const rows = await req(`community_posts?select=${cols}&order=created_at.desc&limit=100`, { method: 'GET' });
        const pend = posts.filter((p) => p._pending);
        const srv = (rows || []).map((r) => {
          r.score = (r.score || 0) + pendingVoteDelta('post', r.id);
          r.comment_count = (r.comment_count || 0) + queue.filter((q) => q.op === 'comment' && q.row.post_id === r.id).length;
          return r;
        });
        const ids = new Set(srv.map((r) => r.id));
        posts = pend.filter((p) => !ids.has(p.id)).concat(srv);
        posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        lastError = null;
        try { localStorage.setItem(K.syncedAt, String(Date.now())); } catch (_) { /* ignore */ }
        persist();
      } catch (e) {
        lastError = e && e.message ? e.message : 'error';
      } finally {
        refreshing = null;
        emit({ kind: 'posts' });
      }
      return listPosts();
    })();
    return refreshing;
  }

  async function refreshComments(postId) {
    if (mode() !== 'cloud' || !postId || String(postId).startsWith('pinned-guide-')) { emit({ kind: 'comments', postId }); return getComments(postId); }
    try {
      const rows = await req(`community_comments?select=*&post_id=eq.${encodeURIComponent(postId)}&order=created_at.asc&limit=500`, { method: 'GET' });
      const pend = (comments[postId] || []).filter((c) => c._pending);
      const srv = (rows || []).map((r) => { r.score = (r.score || 0) + pendingVoteDelta('comment', r.id); return r; });
      const ids = new Set(srv.map((r) => r.id));
      comments[postId] = srv.concat(pend.filter((c) => !ids.has(c.id)));
      persist();
    } catch (e) { lastError = e && e.message ? e.message : 'error'; }
    emit({ kind: 'comments', postId });
    return getComments(postId);
  }

  // ---------- writes ----------
  function region() {
    try {
      const pin = String((E.UI && E.UI.profile && E.UI.profile.pincode) || '').replace(/\D/g, '');
      return pin.length >= 3 ? pin.slice(0, 3) : null;
    } catch (_) { return null; }
  }

  function createPost(data) {
    const m = me();
    const topic = TOPICS.includes(data.topic) ? data.topic : 'general';
    const img = data.image || data.photoUrl || null;
    const row = {
      id: uuid(),
      author_id: m.id,
      author_name: m.name || 'Farmer',
      author_village: m.village || null,
      author_crop: m.cropId || null,
      region: region(),
      crop_id: data.cropId || m.cropId || null,
      topic,
      title: String(data.title || '').trim().slice(0, 140),
      body: String(data.body || '').trim().slice(0, 4000),
      image: img,
      readings: data.readings || null,
      lang: (E.i18n && E.i18n.lang) || 'hi',
      score: 1,
      comment_count: 0,
      created_at: new Date().toISOString()
    };
    votes['post:' + row.id] = 1;
    save(K.votes, votes);
    const local = Object.assign({}, row, { _pending: !!cloud(), ok: true, post: row });
    posts.unshift(local);
    if (cloud()) queue.push({ op: 'post', row });
    persist();
    emit({ kind: 'posts' });
    flush();
    return { ok: true, post: decoratePost(local) };
  }

  function addComment(postIdOrObj, parentId, body, opts) {
    let postId = postIdOrObj;
    if (postIdOrObj && typeof postIdOrObj === 'object') {
      postId = postIdOrObj.postId;
      parentId = postIdOrObj.parentId || null;
      body = postIdOrObj.body || '';
      opts = { agri: !!postIdOrObj.isAgri };
    }
    opts = opts || {};
    const m = me();
    const isAgri = !!opts.agri;
    const row = {
      id: uuid(),
      post_id: postId,
      parent_id: parentId || null,
      author_id: isAgri ? 'agri' : m.id,
      author_name: isAgri ? 'Agri' : (m.name || 'Farmer'),
      author_village: isAgri ? null : (m.village || null),
      author_crop: isAgri ? null : (m.cropId || null),
      body: String(body || '').trim().slice(0, 2000),
      is_agri: isAgri,
      score: 1,
      created_at: new Date().toISOString()
    };
    if (!row.body) return null;
    const isGuide = String(postId).startsWith('pinned-guide-');
    const local = Object.assign({}, row, { _pending: !!cloud() && !isGuide });
    (comments[postId] = comments[postId] || []).push(local);
    const p = posts.find((x) => x.id === postId);
    if (p) p.comment_count = (p.comment_count || 0) + 1;
    if (cloud() && !isGuide) queue.push({ op: 'comment', row });
    persist();
    emit({ kind: 'comments', postId });
    flush();
    return local;
  }

  function myVote(typeOrId, maybeId) {
    if (maybeId !== undefined) return votes[typeOrId + ':' + maybeId] || 0;
    return votes['post:' + typeOrId] || votes['comment:' + typeOrId] || 0;
  }

  function vote(type, id, value) {
    const k = type + ':' + id;
    const prev = votes[k] || 0;
    const next = prev === value ? 0 : value;           // tap again to undo
    const delta = next - prev;
    if (!delta) return next;
    votes[k] = next;
    save(K.votes, votes);
    let target = null;
    if (type === 'post') target = posts.find((p) => p.id === id);
    else for (const pid of Object.keys(comments)) { target = (comments[pid] || []).find((c) => c.id === id); if (target) break; }
    if (target) target.score = (target.score || 0) + delta;
    const isLocalOnly = String(id).startsWith('pinned-guide-') || !cloud();
    if (!isLocalOnly) {
      // Collapse repeated taps on the same item into one queued op.
      const existing = queue.find((q) => q.op === 'vote' && q.type === type && q.id === id);
      if (existing) { existing.value = next; existing.delta = (existing.delta || 0) + delta; }
      else queue.push({ op: 'vote', type, id, value: next, delta });
    }
    persist();
    emit({ kind: 'vote', id });
    flush();
    return next;
  }

  function report(type, id) {
    if (!hidden.includes(id)) hidden.push(id);
    save(K.hidden, hidden);
    if (cloud() && !String(id).startsWith('guide-')) queue.push({ op: 'report', type, id });
    persist();
    emit({ kind: 'report', id });
    flush();
  }

  function isSaved(id) { return saved.includes(id); }
  function toggleSave(id) {
    if (saved.includes(id)) saved = saved.filter((x) => x !== id);
    else saved.unshift(id);
    save(K.saved, saved);
    emit({ kind: 'saved', id });
    return saved.includes(id);
  }
  function savedIds() { return saved.slice(); }

  // ---------- queue replay ----------
  async function flush() {
    if (flushing || mode() !== 'cloud' || !queue.length) return;
    flushing = true;
    try {
      while (queue.length && mode() === 'cloud') {
        const q = queue[0];
        try {
          if (q.op === 'post') {
            await req('community_posts?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(q.row) });
            const p = getPost(q.row.id);
            if (p) delete p._pending;
          } else if (q.op === 'comment') {
            await req('community_comments?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(q.row) });
            const c = (comments[q.row.post_id] || []).find((x) => x.id === q.row.id);
            if (c) delete c._pending;
          } else if (q.op === 'vote') {
            await req('rpc/community_vote', { method: 'POST', body: JSON.stringify({ p_type: q.type, p_id: q.id, p_voter: me().id, p_value: q.value }) });
          } else if (q.op === 'report') {
            await req('rpc/community_report', { method: 'POST', body: JSON.stringify({ p_type: q.type, p_id: q.id }) });
          }
          queue.shift();
          persist();
        } catch (e) {
          lastError = e && e.message ? e.message : 'error';
          // 4xx (except 408/429) = permanently rejected payload: drop it so the
          // queue never jams. Network / 5xx: stop and retry later.
          if (e && e.status && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
            const dropped = queue.shift();
            if (dropped && dropped.op === 'post') { const p = getPost(dropped.row.id); if (p) { p._pending = false; p._failed = true; } }
            if (dropped && dropped.op === 'comment') { const c = (comments[dropped.row.post_id] || []).find((x) => x.id === dropped.row.id); if (c) { c._pending = false; c._failed = true; } }
            persist();
            continue;
          }
          break;
        }
      }
    } finally {
      flushing = false;
      emit({ kind: 'sync' });
    }
  }

  function status() {
    let syncedAt = 0;
    try { syncedAt = +localStorage.getItem(K.syncedAt) || 0; } catch (_) { /* ignore */ }
    return { mode: mode(), pending: queue.length, lastError, syncedAt };
  }

  window.addEventListener('online', () => { flush().then(() => refresh()); });

  E.community = {
    TOPICS, me, hasMe, setMe, mode, status,
    listPosts, getPost, getComments, refresh, refreshComments,
    createPost, addComment, vote, myVote, report,
    isSaved, toggleSave, savedIds, flush
  };
})();
