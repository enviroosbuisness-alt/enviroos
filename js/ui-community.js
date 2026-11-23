/* EnviroOS — ENVIROCHAT (Reddit-Style Farmer Community UI).
 * Owns: U.vComm, U.openPost, U.dlgNewPost, U.dlgCommMe, client-side photo compression,
 * nested comment tree rendering, voice dictation hooks, and "Ask Agri to Answer".
 */
'use strict';
(function () {
  const E = window.EnviroOS;
  const U = E.UI;
  const { t, esc, fmt1, fmtInt, $ } = U;

  U.commState = {
    topic: 'all',
    sort: 'hot',
    search: '',
    openPostId: null,
    replyParentId: null,
    replyParentAuthor: '',
    agriBusyPostId: null,
    draftPhoto: null,
    draftAttachReadings: true,
    draftTopic: 'general',
    guideCollapsed: {}
  };

  const TOPIC_META = {
    all:        { icon: U.icons.grain, tone: 'good' },
    water:      { icon: U.icons.drop, tone: 'water' },
    pests:      { icon: U.icons.bug, tone: 'warn' },
    fertilizer: { icon: U.icons.flask, tone: 'soil' },
    mandi:      { icon: U.icons.scale, tone: 'gold' },
    weather:    { icon: U.icons.rain, tone: 'sky' },
    equipment:  { icon: U.icons.gear, tone: 'mute' },
    general:    { icon: U.icons.chat, tone: 'good' }
  };

  function relTime(iso) {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 45000) return t('just_now');
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} ${t('min_ago')}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  function avatarInitials(name) {
    const clean = String(name || '').trim();
    if (!clean) return 'K';
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }

  function localizePinned(post) {
    if (!post || !post.is_pinned) return post;
    if (post.id === 'pinned-guide-welcome') {
      return Object.assign({}, post, {
        title: t('comm_guide_1_title'),
        body: t('comm_guide_1_body')
      });
    }
    if (post.id === 'pinned-guide-yellowing') {
      return Object.assign({}, post, {
        title: t('comm_guide_2_title'),
        body: t('comm_guide_2_body')
      });
    }
    return post;
  }

  function renderReadingsCard(r) {
    if (!r || typeof r !== 'object') return '';
    const cells = [];
    if (r.moisture != null) cells.push(`<div class="comm-snap-cell"><span class="k"><span class="snap-ic">${U.icons.drop}</span> ${esc(t('cond_water'))}</span><strong>${fmt1(r.moisture)}%</strong></div>`);
    if (r.tempC != null) cells.push(`<div class="comm-snap-cell"><span class="k"><span class="snap-ic">${U.icons.heat}</span> ${esc(t('cond_heat'))}</span><strong>${fmt1(r.tempC)}°C</strong></div>`);
    if (r.ph != null) cells.push(`<div class="comm-snap-cell"><span class="k"><span class="snap-ic">${U.icons.flask}</span> pH</span><strong>${fmt1(r.ph)}</strong></div>`);
    if (r.n != null || r.p != null || r.k != null) {
      cells.push(`<div class="comm-snap-cell"><span class="k"><span class="snap-ic">${U.icons.leaf}</span> NPK</span><strong>${fmtInt(r.n)}·${fmtInt(r.p)}·${fmtInt(r.k)}</strong></div>`);
    }
    if (!cells.length) return '';
    const stageStr = r.stage ? ` • ${t('stage_' + r.stage)}` : '';
    return `<div class="comm-snap-card" aria-label="${esc(t('comm_readings_attached'))}">`
      + `<div class="comm-snap-head"><span class="comm-snap-dot"></span><span>${esc(t('comm_readings_attached'))}${stageStr}</span></div>`
      + `<div class="comm-snap-grid">${cells.join('')}</div>`
      + `</div>`;
  }

  function renderPostCard(rawPost, isDetail) {
    const p = localizePinned(rawPost);
    const C = E.community;
    const myV = C.myVote(p.id);
    const saved = C.isSaved(p.id);
    const meta = TOPIC_META[p.topic] || TOPIC_META.general;
    const cropKey = 'crop_' + (p.crop_id || 'bajra');
    const cropLabel = t(cropKey) !== cropKey ? t(cropKey) : (p.crop_id || '');
    const cropEmoji = U.cropEmoji(p.crop_id || 'bajra');
    const isAgri = !!p.is_pinned || p.author_id === 'agri-guide';
    const score = Number(p.upvotes || 0);
    const cCount = Number(p.comment_count || 0);
    const replyLabel = cCount === 1 ? t('comm_comment_one') : t('comm_comments_count').replace('{n}', cCount);
    const ttsText = `${p.author_name || ''}. ${p.title}. ${p.body || ''}`;
    const collapsed = !isDetail && p.is_pinned && U.commState.guideCollapsed[p.id];

    return `<article class="comm-post${p.is_pinned ? ' is-pinned' : ''}${isDetail ? ' is-detail' : ''}" data-post-card="${esc(p.id)}">`
      + `<div class="comm-vote-col" role="group" aria-label="Vote">`
      + `<button class="vote-btn up${myV === 1 ? ' active' : ''}" data-comm-vote="1" data-target-type="post" data-target-id="${esc(p.id)}" type="button" aria-label="Upvote">${U.icons.up}</button>`
      + `<span class="vote-score${myV === 1 ? ' up' : (myV === -1 ? ' down' : '')}">${score}</span>`
      + `<button class="vote-btn down${myV === -1 ? ' active' : ''}" data-comm-vote="-1" data-target-type="post" data-target-id="${esc(p.id)}" type="button" aria-label="Downvote">${U.icons.down}</button>`
      + `</div>`
      + `<div class="comm-post-main">`
      + `<header class="comm-post-meta">`
      + `<span class="comm-avatar${isAgri ? ' agri' : ''}" aria-hidden="true">${isAgri ? U.icons.sparkle : esc(avatarInitials(p.author_name))}</span>`
      + `<div class="comm-meta-text">`
      + `<div class="comm-meta-top">`
      + `<strong class="comm-author">${esc(p.author_name || 'Farmer')}</strong>`
      + (isAgri ? `<span class="comm-badge-agri">${U.icons.pin} ${esc(t('comm_pinned_badge'))}</span>` : '')
      + (p.author_village ? `<span class="comm-village">${U.icons.pin} <span>${esc(p.author_village)}${p.region_prefix ? ` (${esc(p.region_prefix)}xxx)` : ''}</span></span>` : '')
      + `<span class="comm-time">${esc(relTime(p.created_at))}</span>`
      + `</div>`
      + `<div class="comm-meta-tags">`
      + `<span class="comm-flair tone-${meta.tone}">${meta.icon} ${esc(t('topic_' + (p.topic || 'general')))}</span>`
      + (cropLabel ? `<span class="comm-crop-tag"><span class="crop-ic">${cropEmoji}</span> <span>${esc(cropLabel)}</span></span>` : '')
      + `</div>`
      + `</div>`
      + (p.is_pinned && !isDetail
        ? `<button class="icon-btn sm comm-collapse-btn" data-comm-toggle-guide="${esc(p.id)}" type="button" aria-label="Toggle guide">${collapsed ? U.icons.chev : U.icons.minus}</button>`
        : '')
      + `</header>`
      + `<div class="comm-post-hit" ${isDetail ? '' : `data-comm-open="${esc(p.id)}" role="button" tabindex="0"`}>`
      + `<h3 class="comm-post-title">${esc(p.title)}</h3>`
      + (!collapsed && p.body ? `<p class="comm-post-body">${esc(p.body)}</p>` : '')
      + (!collapsed && p.photo_url ? `<div class="comm-photo-wrap"><img class="comm-photo" src="${esc(p.photo_url)}" alt="${esc(p.title)}" loading="lazy"/></div>` : '')
      + (!collapsed && p.readings ? renderReadingsCard(p.readings) : '')
      + `</div>`
      + `<footer class="comm-actions">`
      + (!isDetail
        ? `<button class="comm-act-btn primary-act" data-comm-open="${esc(p.id)}" type="button">${U.icons.chat} <span>${esc(replyLabel)}</span></button>`
        : `<span class="comm-act-stat">${U.icons.chat} <span>${esc(replyLabel)}</span></span>`)
      + `<button class="comm-act-btn" data-say="${esc(ttsText)}" type="button">${U.icons.speaker} <span>${esc(t('listen_label'))}</span></button>`
      + (!p.is_pinned
        ? `<button class="comm-act-btn agri-act" data-comm-ask-agri="${esc(p.id)}" type="button">${U.icons.sparkle} <span>${esc(t('comm_ask_agri_btn'))}</span></button>`
        : '')
      + `<button class="comm-act-btn${saved ? ' active' : ''}" data-comm-save="${esc(p.id)}" type="button">${U.icons.bookmark} <span>${esc(saved ? t('comm_saved') : t('comm_save'))}</span></button>`
      + (!p.is_pinned
        ? `<button class="comm-act-btn mute-act" data-comm-report="post" data-target-id="${esc(p.id)}" type="button" title="${esc(t('comm_report'))}">${U.icons.flag}</button>`
        : '')
      + `</footer>`
      + `</div>`
      + `</article>`;
  }

  /* ---------- main community screen ---------- */
  U.vComm = () => {
    const C = E.community;
    const st = U.commState;
    const info = U.nodeInfo();
    const me = C.me();
    const status = C.status();
    const modeKey = status.mode === 'cloud' ? 'comm_mode_cloud' : (status.mode === 'offline' ? 'comm_mode_offline' : 'comm_mode_local');
    const modeTone = status.mode === 'cloud' ? 'good' : (status.mode === 'offline' ? 'warn' : 'mute');

    // Topic counts from all posts
    const allPosts = C.listPosts({ topic: 'all', sort: 'new' });
    const topicCounts = { all: allPosts.length };
    C.TOPICS.forEach((tp) => { topicCounts[tp] = 0; });
    allPosts.forEach((p) => {
      const tp = p.topic || 'general';
      topicCounts[tp] = (topicCounts[tp] || 0) + 1;
    });

    const filtered = C.listPosts({
      topic: st.topic,
      sort: st.sort,
      search: st.search,
      cropId: info.cropId,
      regionPrefix: String((U.profile && U.profile.pincode) || '').slice(0, 3)
    });

    const pinnedPosts = filtered.filter((p) => p.is_pinned);
    const farmerPosts = filtered.filter((p) => !p.is_pinned);
    const savedCount = C.savedIds().length;

    // 1. Hero Header Card
    const heroHtml = `<div class="card comm-hero">`
      + `<div class="comm-hero-top">`
      + `<div class="comm-hero-title-wrap">`
      + `<div class="comm-status-row">`
      + `<span class="comm-live-pill tone-${modeTone}"><span class="dot"></span>${esc(t(modeKey))}</span>`
      + (status.pending > 0 ? `<span class="comm-sync-pill">${esc(t('comm_pending_sync').replace('{n}', status.pending))}</span>` : '')
      + `<button class="icon-btn sm" data-comm-refresh="1" type="button" title="Refresh">${U.icons.refresh}</button>`
      + `</div>`
      + `<h2 class="comm-hero-h">${esc(t('comm_title'))}</h2>`
      + `<p class="comm-hero-sub">${esc(t('comm_sub'))}</p>`
      + `</div>`
      + `<div class="comm-hero-cta">`
      + `<button class="btn primary comm-new-btn" data-comm-new="1" type="button">${U.icons.plus} <span>${esc(t('comm_new_post'))}</span></button>`
      + `<button class="comm-me-pill" data-comm-me="1" type="button" title="${esc(t('comm_identity_title'))}">`
      + `<span class="comm-avatar sm">${esc(avatarInitials(me.name || t('comm_edit_me'), false))}</span>`
      + `<span class="comm-me-txt"><strong>${esc(me.name || t('comm_edit_me'))}</strong><small>${esc(me.village || info.cropName)}</small></span>`
      + `${U.icons.chev}`
      + `</button>`
      + `</div>`
      + `</div>`
      // Search + Sort bar
      + `<div class="comm-toolbar">`
      + `<div class="comm-search-box">`
      + `<input id="comm-search-input" class="comm-search-in" type="search" value="${esc(st.search)}" placeholder="${esc(t('comm_search_ph'))}" aria-label="${esc(t('comm_search_ph'))}"/>`
      + (st.search ? `<button class="icon-btn sm" data-comm-clear-search="1" type="button" aria-label="Clear">${U.icons.close}</button>` : '')
      + `<button class="icon-btn sm" data-comm-voice-search="1" type="button" title="${esc(t('voice_tap_to_speak'))}">${U.icons.mic}</button>`
      + `</div>`
      + `<div class="comm-sorts" role="tablist" aria-label="Sort posts">`
      + [
        ['hot', U.icons.flame, t('sort_hot')],
        ['new', U.icons.sparkle, t('sort_new')],
        ['top', U.icons.trophy, t('sort_top')],
        ['crop', info.emoji || U.icons.sprout, t('sort_crop')],
        ['region', U.icons.pin, t('sort_region')],
        ['saved', U.icons.bookmark, `${t('sort_saved')}${savedCount ? ` (${savedCount})` : ''}`]
      ].map(([id, ic, lbl]) =>
        `<button class="comm-sort-btn${st.sort === id ? ' on' : ''}" data-comm-sort="${id}" type="button" role="tab" aria-selected="${st.sort === id}"><span class="sort-ic">${ic}</span> <span>${esc(lbl)}</span></button>`
      ).join('')
      + `</div>`
      + `</div>`
      // Topic flair chips
      + `<div class="comm-topics" role="tablist" aria-label="Topics">`
      + ['all'].concat(C.TOPICS).map((tp) => {
        const m = TOPIC_META[tp] || TOPIC_META.general;
        const cnt = topicCounts[tp] || 0;
        return `<button class="comm-topic-chip${st.topic === tp ? ' on' : ''}" data-comm-topic="${tp}" type="button" role="tab" aria-selected="${st.topic === tp}">`
          + `<span class="tp-ic">${m.icon}</span><span>${esc(t('topic_' + tp))}</span><small class="tp-cnt">${cnt}</small>`
          + `</button>`;
      }).join('')
      + `</div>`
      + `</div>`;

    // 2. Feed Layout
    const guidesHtml = pinnedPosts.length
      ? `<div class="comm-section-stack">${pinnedPosts.map((p) => renderPostCard(p, false)).join('')}</div>`
      : '';

    const emptyFarmerHtml = `<div class="card comm-empty-card">`
      + `<div class="comm-empty-ic" aria-hidden="true">${U.icons.chat}</div>`
      + `<h3>${esc(t('comm_empty_title'))}</h3>`
      + `<p class="muted">${esc(t('comm_empty_sub'))}</p>`
      + `<div class="comm-quick-starters">`
      + `<button class="chip-btn" data-comm-new-topic="water" type="button"><span class="chip-ic">${U.icons.drop}</span> <span>${esc(t('topic_water'))}</span></button>`
      + `<button class="chip-btn" data-comm-new-topic="pests" type="button"><span class="chip-ic">${U.icons.bug}</span> <span>${esc(t('topic_pests'))}</span></button>`
      + `<button class="chip-btn" data-comm-new-topic="fertilizer" type="button"><span class="chip-ic">${U.icons.flask}</span> <span>${esc(t('topic_fertilizer'))}</span></button>`
      + `<button class="chip-btn" data-comm-new-topic="mandi" type="button"><span class="chip-ic">${U.icons.scale}</span> <span>${esc(t('topic_mandi'))}</span></button>`
      + `</div>`
      + `<button class="btn primary" data-comm-new="1" type="button">${U.icons.plus} <span>${esc(t('comm_new_post'))}</span></button>`
      + `</div>`;

    const postsHtml = farmerPosts.length
      ? `<div class="comm-feed-list">${farmerPosts.map((p) => renderPostCard(p, false)).join('')}</div>`
      : emptyFarmerHtml;

    return `<div class="comm-layout">${heroHtml}${guidesHtml}${postsHtml}</div>`;
  };

  /* ---------- post detail thread sheet ---------- */
  function renderCommentTree(comments, parentId, depth) {
    const C = E.community;
    const kids = comments.filter((c) => (c.parent_id || null) === (parentId || null));
    if (!kids.length) return '';
    return `<div class="comm-tree${depth > 0 ? ' nested' : ''}">`
      + kids.map((c) => {
        const myV = C.myVote(c.id);
        const isAgri = !!c.is_agri || c.author_id === 'agri-ai';
        const score = Number(c.upvotes || 0);
        const tts = `${c.author_name || ''}. ${c.body || ''}`;
        return `<div class="comm-comment${isAgri ? ' is-agri' : ''}" data-comment-id="${esc(c.id)}">`
          + `<div class="comm-comment-head">`
          + `<span class="comm-avatar xs${isAgri ? ' agri' : ''}">${isAgri ? U.icons.sparkle : esc(avatarInitials(c.author_name))}</span>`
          + `<strong class="comm-author">${esc(c.author_name || 'Farmer')}</strong>`
          + (isAgri ? `<span class="comm-badge-agri">${U.icons.sparkle} ${esc(t('comm_agri_badge'))}</span>` : '')
          + (c.author_village ? `<span class="comm-village">${U.icons.pin} <span>${esc(c.author_village)}</span></span>` : '')
          + `<span class="comm-time">${esc(relTime(c.created_at))}</span>`
          + `</div>`
          + `<p class="comm-comment-body">${esc(c.body)}</p>`
          + `<div class="comm-comment-bar">`
          + `<button class="vote-inline up${myV === 1 ? ' active' : ''}" data-comm-vote="1" data-target-type="comment" data-target-id="${esc(c.id)}" type="button" aria-label="Upvote">${U.icons.up} <span>${score}</span></button>`
          + `<button class="vote-inline down${myV === -1 ? ' active' : ''}" data-comm-vote="-1" data-target-type="comment" data-target-id="${esc(c.id)}" type="button" aria-label="Downvote">${U.icons.down}</button>`
          + `<button class="comm-act-btn xs" data-say="${esc(tts)}" type="button">${U.icons.speaker} <span>${esc(t('listen_label'))}</span></button>`
          + `<button class="comm-act-btn xs" data-comm-reply-to="${esc(c.id)}" data-comm-reply-author="${esc(c.author_name || 'Farmer')}" type="button">${U.icons.chat} <span>${esc(t('comm_reply_btn'))}</span></button>`
          + (!isAgri ? `<button class="comm-act-btn xs mute-act" data-comm-report="comment" data-target-id="${esc(c.id)}" type="button" title="${esc(t('comm_report'))}">${U.icons.flag}</button>` : '')
          + `</div>`
          + renderCommentTree(comments, c.id, Math.min(depth + 1, 4))
          + `</div>`;
      }).join('')
      + `</div>`;
  }

  U.openPost = (postId) => {
    const C = E.community;
    const raw = C.getPost(postId);
    if (!raw) return;
    U.commState.openPostId = postId;
    U.openSheetId = 'comm-post:' + postId;
    const p = localizePinned(raw);
    const comments = C.getComments(postId);
    const busy = U.commState.agriBusyPostId === postId;
    const repTo = U.commState.replyParentId;
    const repAuthor = U.commState.replyParentAuthor;

    const html = `<div class="sheet-head">`
      + `<div><div class="label">${esc(t('comm_title'))}</div><div class="sheet-title">${esc(t('topic_' + (p.topic || 'general')))}</div></div>`
      + `<button class="icon-btn" data-close-sheet="1" type="button" aria-label="${esc(t('close_label'))}">${U.icons.close}</button>`
      + `</div>`
      + renderPostCard(p, true)
      + `<div class="comm-reply-box">`
      + (repTo
        ? `<div class="comm-replying-banner"><span>↩ ${esc(t('comm_reply_btn'))}: <strong>${esc(repAuthor)}</strong></span>`
          + `<button class="icon-btn sm" data-comm-cancel-reply="1" type="button">${U.icons.close}</button></div>`
        : '')
      + `<div class="comm-reply-row">`
      + `<textarea id="comm-reply-input" class="input comm-textarea" rows="2" maxlength="1500" placeholder="${esc(t('comm_reply_ph'))}"></textarea>`
      + `<div class="comm-reply-btns">`
      + `<button class="icon-btn" data-dictate-sheet="comm-reply-input" type="button" title="${esc(t('voice_tap_to_speak'))}">${U.icons.mic}</button>`
      + `<button class="btn primary sm" data-comm-send-reply="${esc(postId)}" type="button">${U.icons.send} <span>${esc(t('comm_reply_btn'))}</span></button>`
      + `</div>`
      + `</div>`
      + `</div>`
      + (busy
        ? `<div class="comm-agri-loading"><span class="vwave" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${esc(t('comm_agri_thinking'))}</span></div>`
        : '')
      + `<div class="comm-comments-wrap">`
      + (comments.length ? renderCommentTree(comments, null, 0) : `<p class="muted comm-no-comments">${esc(t('comm_no_comments'))}</p>`)
      + `</div>`;

    U.openSheet(html);
    const cb = $('sheet-body').querySelector('[data-close-sheet]');
    if (cb) cb.addEventListener('click', U.closeSheet);
  };

  /* ---------- Ask Agri to Answer ---------- */
  U.askAgriOnPost = async (postId) => {
    const C = E.community;
    const raw = C.getPost(postId);
    if (!raw || U.commState.agriBusyPostId === postId) return;
    const p = localizePinned(raw);
    U.commState.agriBusyPostId = postId;
    U.openPost(postId);

    let answer = '';
    try {
      if (E.gemini && E.gemini.generateCommunityAnswer) {
        answer = await E.gemini.generateCommunityAnswer(p, E.i18n.lang);
      }
    } catch (_) { /* fallback below */ }

    if (!answer) {
      // Deterministic offline agronomy fallback grounded in the post's readings or current farm analysis
      const r = p.readings || U.snapshot || {};
      const crop = E.getCrop(p.crop_id || (U.profile && U.profile.cropId) || 'bajra');
      const parts = [];
      if (E.i18n.lang === 'hi') {
        if (r.moisture != null) {
          if (r.moisture < (crop.moistureLow || 20)) parts.push(`मिट्टी की नमी ${fmt1(r.moisture)}% कम है — हल्की सिंचाई सुबह या शाम को करें।`);
          else if (r.moisture > (crop.moistureHigh || 45)) parts.push(`नमी ${fmt1(r.moisture)}% अधिक है — अभी सिंचाई रोकें और जल निकासी देखें।`);
          else parts.push(`मिट्टी की नमी (${fmt1(r.moisture)}%) इस समय उपयुक्त है।`);
        }
        if (r.ph != null && (r.ph < 6.0 || r.ph > 8.0)) {
          parts.push(`मिट्टी का pH ${fmt1(r.ph)} है, इसलिए पोषक तत्वों के बेहतर अवशोषण के लिए गोबर की खाद या जिप्सम/चूना स्थानीय सलाह से दें।`);
        }
        parts.push('पत्तियों के नीचे कीट जांचें और कोई भी छिड़काव शांत हवा में शाम के समय ही करें।');
      } else {
        if (r.moisture != null) {
          if (r.moisture < (crop.moistureLow || 20)) parts.push(`Soil moisture is low (${fmt1(r.moisture)}%) — irrigate lightly in the cool morning or evening hours.`);
          else if (r.moisture > (crop.moistureHigh || 45)) parts.push(`Soil moisture is high (${fmt1(r.moisture)}%) — pause irrigation and check field drainage.`);
          else parts.push(`Soil moisture (${fmt1(r.moisture)}%) is currently in a healthy range.`);
        }
        if (r.ph != null && (r.ph < 6.0 || r.ph > 8.0)) {
          parts.push(`Soil pH is ${fmt1(r.ph)} — adding well-rotted compost helps buffer nutrient uptake.`);
        }
        parts.push('Inspect the underside of 5–10 leaves across the field before spraying, and apply treatments only in calm evening wind.');
      }
      answer = parts.join(' ');
    }

    await C.addComment({
      postId,
      body: answer,
      isAgri: true
    });
    U.commState.agriBusyPostId = null;
    if (U.openSheetId === 'comm-post:' + postId) U.openPost(postId);
    if (U.route === 'comm') U.render();
  };

  /* ---------- client-side photo compression ---------- */
  function compressPhotoFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error('no_file')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read_err'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('img_err'));
        img.onload = () => {
          const maxDim = 900;
          let w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- New Post Composer Dialog ---------- */
  U.dlgNewPost = (presetTopic) => {
    const C = E.community;
    const me = C.me();
    const info = U.nodeInfo();
    if (presetTopic && C.TOPICS.includes(presetTopic)) U.commState.draftTopic = presetTopic;
    const curTopic = U.commState.draftTopic || 'general';
    const s = U.snapshot;
    const liveSnap = s ? {
      moisture: s.moisture,
      tempC: s.tempC,
      ph: s.ph,
      n: s.n,
      p: s.p,
      k: s.k,
      stage: info.stage
    } : null;

    U.openDlg(`<div class="dlg-head"><div class="dlg-title">${esc(t('comm_new_post'))}</div>`
      + `<button class="icon-btn" onclick="EnviroOS.UI.closeDlg()" type="button">${U.icons.close}</button></div>`
      // Quick inline author identity row so farmer never has to register separately
      + `<div class="comm-composer-me">`
      + `<div class="field-2col">`
      + `<div class="field"><label for="comm-f-name">${esc(t('comm_name_label'))}</label>`
      + `<div class="input-row"><input id="comm-f-name" class="input" type="text" maxlength="50" value="${esc(me.name || '')}" placeholder="${esc(t('comm_name_ph'))}"/>`
      + `<button class="icon-btn" data-dictate="comm-f-name" type="button">${U.icons.mic}</button></div></div>`
      + `<div class="field"><label for="comm-f-village">${esc(t('comm_village_label'))}</label>`
      + `<div class="input-row"><input id="comm-f-village" class="input" type="text" maxlength="60" value="${esc(me.village || '')}" placeholder="${esc(t('comm_village_ph'))}"/>`
      + `<button class="icon-btn" data-dictate="comm-f-village" type="button">${U.icons.mic}</button></div></div>`
      + `</div>`
      + `</div>`
      // Topic selector
      + `<div class="field"><label>${esc(t('topic_all'))}</label>`
      + `<div class="comm-topic-picker" id="comm-f-topics">`
      + C.TOPICS.map((tp) => {
        const m = TOPIC_META[tp] || TOPIC_META.general;
        return `<button class="comm-topic-chip${curTopic === tp ? ' on' : ''}" data-pick-comm-topic="${tp}" type="button">`
          + `<span>${m.icon}</span><span>${esc(t('topic_' + tp))}</span></button>`;
      }).join('')
      + `</div></div>`
      // Question / Title
      + `<div class="field"><label for="comm-f-title">${esc(t('comm_post_title_lbl'))}</label>`
      + `<div class="input-row"><input id="comm-f-title" class="input" type="text" maxlength="220" placeholder="${esc(t('comm_post_title_ph'))}"/>`
      + `<button class="icon-btn" data-dictate="comm-f-title" type="button" title="${esc(t('voice_tap_to_speak'))}">${U.icons.mic}</button></div></div>`
      // Details / Body
      + `<div class="field"><label for="comm-f-body">${esc(t('comm_post_body_lbl'))}</label>`
      + `<div class="input-row"><textarea id="comm-f-body" class="input comm-textarea" rows="3" maxlength="2000" placeholder="${esc(t('comm_post_body_ph'))}"></textarea>`
      + `<button class="icon-btn" data-dictate="comm-f-body" type="button" title="${esc(t('voice_tap_to_speak'))}">${U.icons.mic}</button></div></div>`
      // Photo attachment + Live Readings toggle
      + `<div class="comm-attach-bar">`
      + `<label class="btn ghost sm comm-photo-lbl" for="comm-f-photo-in">${U.icons.photo} <span id="comm-f-photo-txt">${esc(U.commState.draftPhoto ? t('comm_remove_photo') : t('comm_attach_photo'))}</span></label>`
      + `<input id="comm-f-photo-in" type="file" accept="image/*" hidden/>`
        + `<label class="comm-readings-toggle">`
        + `<input id="comm-f-readings-chk" type="checkbox" ${U.commState.draftAttachReadings ? 'checked' : ''}/>`
        + `<span><span class="chk-ic">${U.icons.chart}</span> <span>${esc(t('comm_attach_readings'))}</span></span>`
        + `</label>`
      + `</div>`
      + `<div id="comm-f-photo-preview">${U.commState.draftPhoto ? `<div class="comm-photo-wrap sm"><img class="comm-photo" src="${esc(U.commState.draftPhoto)}" alt="Preview"/></div>` : ''}</div>`
      + `<div id="comm-f-readings-preview">${U.commState.draftAttachReadings && liveSnap ? renderReadingsCard(liveSnap) : ''}</div>`
      + `<div class="btn-row" style="margin-top:16px">`
      + `<button class="btn ghost" onclick="EnviroOS.UI.closeDlg()" type="button">${esc(t('comm_cancel'))}</button>`
      + `<button class="btn primary" id="comm-f-submit" type="button">${U.icons.send} <span>${esc(t('comm_publish'))}</span></button>`
      + `</div>`);

    // Wire composer interactions
    const body = $('dlg-body');
    body.querySelectorAll('[data-pick-comm-topic]').forEach((b) => b.addEventListener('click', () => {
      U.commState.draftTopic = b.dataset.pickCommTopic;
      body.querySelectorAll('[data-pick-comm-topic]').forEach((x) => x.classList.toggle('on', x === b));
    }));

    const photoIn = body.querySelector('#comm-f-photo-in');
    if (photoIn) {
      photoIn.addEventListener('change', async (e) => {
        const f = e.target.files && e.target.files[0];
        if (!f) return;
        try {
          const dataUrl = await compressPhotoFile(f);
          U.commState.draftPhoto = dataUrl;
          const prev = body.querySelector('#comm-f-photo-preview');
          if (prev) prev.innerHTML = `<div class="comm-photo-wrap sm"><img class="comm-photo" src="${esc(dataUrl)}" alt="Preview"/><button class="icon-btn sm comm-rm-photo" id="comm-f-rm-photo" type="button">${U.icons.close}</button></div>`;
          const rm = body.querySelector('#comm-f-rm-photo');
          if (rm) rm.addEventListener('click', () => {
            U.commState.draftPhoto = null;
            prev.innerHTML = '';
            photoIn.value = '';
          });
        } catch (_) { /* ignore */ }
      });
    }

    const chk = body.querySelector('#comm-f-readings-chk');
    if (chk) {
      chk.addEventListener('change', () => {
        U.commState.draftAttachReadings = !!chk.checked;
        const rPrev = body.querySelector('#comm-f-readings-preview');
        if (rPrev) rPrev.innerHTML = U.commState.draftAttachReadings && liveSnap ? renderReadingsCard(liveSnap) : '';
      });
    }

    const sub = body.querySelector('#comm-f-submit');
    if (sub) {
      sub.addEventListener('click', async () => {
        const nameVal = (body.querySelector('#comm-f-name').value || '').trim();
        const villageVal = (body.querySelector('#comm-f-village').value || '').trim();
        const titleVal = (body.querySelector('#comm-f-title').value || '').trim();
        const bodyVal = (body.querySelector('#comm-f-body').value || '').trim();
        if (!titleVal && !bodyVal) {
          body.querySelector('#comm-f-title').focus();
          return;
        }
        if (nameVal || villageVal) {
          C.setMe({ name: nameVal || me.name || 'Kisan', village: villageVal || me.village || '', cropId: info.cropId });
        }
        const res = await C.createPost({
          topic: U.commState.draftTopic || 'general',
          title: titleVal || bodyVal.slice(0, 80),
          body: bodyVal,
          cropId: info.cropId,
          pincode: (U.profile && U.profile.pincode) || '342001',
          readings: U.commState.draftAttachReadings && liveSnap ? liveSnap : null,
          photoUrl: U.commState.draftPhoto || null
        });
        U.commState.draftPhoto = null;
        U.closeDlg();
        if (res && res.ok) {
          U.commState.topic = 'all';
          U.commState.sort = 'new';
          U.render();
        }
      });
    }
  };

  /* ---------- Farmer Identity Dialog ---------- */
  U.dlgCommMe = () => {
    const C = E.community;
    const me = C.me();
    const info = U.nodeInfo();
    const selCrop = me.cropId || info.cropId || 'bajra';
    const cropsHtml = E.CROP_IDS.map((id) =>
      `<button class="choice${id === selCrop ? ' on' : ''}" data-seg="comm-crop" data-val="${id}" type="button">`
      + `<span style="font-size:20px">${U.cropEmoji(id)}</span><span>${esc(t('crop_' + id))}</span></button>`
    ).join('');

    U.openDlg(`<div class="dlg-head"><div class="dlg-title">${esc(t('comm_identity_title'))}</div>`
      + `<button class="icon-btn" onclick="EnviroOS.UI.closeDlg()" type="button">${U.icons.close}</button></div>`
      + `<p class="muted" style="margin:0 0 12px">${esc(t('comm_identity_sub'))}</p>`
      + `<div class="field"><label for="comm-me-name">${esc(t('comm_name_label'))}</label>`
      + `<div class="input-row"><input id="comm-me-name" class="input" type="text" maxlength="50" value="${esc(me.name || '')}" placeholder="${esc(t('comm_name_ph'))}"/>`
      + `<button class="icon-btn" data-dictate="comm-me-name" type="button">${U.icons.mic}</button></div></div>`
      + `<div class="field"><label for="comm-me-village">${esc(t('comm_village_label'))}</label>`
      + `<div class="input-row"><input id="comm-me-village" class="input" type="text" maxlength="60" value="${esc(me.village || '')}" placeholder="${esc(t('comm_village_ph'))}"/>`
      + `<button class="icon-btn" data-dictate="comm-me-village" type="button">${U.icons.mic}</button></div></div>`
      + `<div class="field"><label>${esc(t('crop_label'))}</label><div class="choice-grid" id="comm-me-crops" data-val="${esc(selCrop)}">${cropsHtml}</div></div>`
      + `<div class="btn-row" style="margin-top:16px">`
      + `<button class="btn primary" id="comm-me-save" type="button" style="flex:1">${U.icons.check} <span>${esc(t('save_label'))}</span></button>`
      + `</div>`);

    const body = $('dlg-body');
    body.querySelectorAll('[data-seg="comm-crop"]').forEach((b) => b.addEventListener('click', () => {
      const box = body.querySelector('#comm-me-crops');
      if (box) box.dataset.val = b.dataset.val;
      body.querySelectorAll('[data-seg="comm-crop"]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    const sv = body.querySelector('#comm-me-save');
    if (sv) {
      sv.addEventListener('click', () => {
        const name = (body.querySelector('#comm-me-name').value || '').trim();
        const village = (body.querySelector('#comm-me-village').value || '').trim();
        const cropBox = body.querySelector('#comm-me-crops');
        const cropId = (cropBox && cropBox.dataset.val) || info.cropId;
        C.setMe({ name: name || 'Kisan', village, cropId });
        U.closeDlg();
        U.render();
      });
    }
  };

  /* ---------- post-render & event delegation ---------- */
  U.afterComm = () => {
    const inp = $('comm-search-input');
    if (inp) {
      inp.addEventListener('input', (e) => {
        U.commState.search = e.target.value;
        const pos = e.target.selectionStart || 0;
        U.render();
        const nextInp = $('comm-search-input');
        if (nextInp) {
          nextInp.focus();
          try { nextInp.setSelectionRange(pos, pos); } catch (_) { /* ignore */ }
        }
      });
    }
  };

  document.addEventListener('click', async (e) => {
    const C = E.community;
    if (!C) return;

    const tp = e.target.closest('[data-comm-topic]');
    if (tp) { U.commState.topic = tp.dataset.commTopic; U.render(); return; }

    const sr = e.target.closest('[data-comm-sort]');
    if (sr) { U.commState.sort = sr.dataset.commSort; U.render(); return; }

    const cs = e.target.closest('[data-comm-clear-search]');
    if (cs) { U.commState.search = ''; U.render(); return; }

    const vs = e.target.closest('[data-comm-voice-search]');
    if (vs) {
      const inp = $('comm-search-input');
      if (inp && E.voice && E.voice.sttSupported) {
        await E.voice.dictate(inp);
        U.commState.search = inp.value;
        U.render();
      }
      return;
    }

    const rf = e.target.closest('[data-comm-refresh]');
    if (rf) { await C.refresh(); U.render(); return; }

    const np = e.target.closest('[data-comm-new]');
    if (np) { U.dlgNewPost(); return; }

    const npt = e.target.closest('[data-comm-new-topic]');
    if (npt) { U.dlgNewPost(npt.dataset.commNewTopic); return; }

    const meBtn = e.target.closest('[data-comm-me]');
    if (meBtn) { U.dlgCommMe(); return; }

    const tg = e.target.closest('[data-comm-toggle-guide]');
    if (tg) {
      const gid = tg.dataset.commToggleGuide;
      U.commState.guideCollapsed[gid] = !U.commState.guideCollapsed[gid];
      U.render();
      return;
    }

    const vt = e.target.closest('[data-comm-vote]');
    if (vt) {
      e.stopPropagation();
      const delta = Number(vt.dataset.commVote) || 1;
      const tType = vt.dataset.targetType || 'post';
      const tId = vt.dataset.targetId;
      await C.vote(tType, tId, delta);
      if (U.openSheetId && U.openSheetId.startsWith('comm-post:')) {
        U.openPost(U.openSheetId.slice('comm-post:'.length));
      }
      if (U.route === 'comm') U.render();
      return;
    }

    const sv = e.target.closest('[data-comm-save]');
    if (sv) {
      e.stopPropagation();
      C.toggleSave(sv.dataset.commSave);
      if (U.openSheetId && U.openSheetId.startsWith('comm-post:')) {
        U.openPost(U.openSheetId.slice('comm-post:'.length));
      }
      if (U.route === 'comm') U.render();
      return;
    }

    const rp = e.target.closest('[data-comm-report]');
    if (rp) {
      e.stopPropagation();
      await C.report(rp.dataset.commReport, rp.dataset.targetId);
      U.toast(t('comm_reported_toast'));
      if (rp.dataset.commReport === 'post' && U.openSheetId === 'comm-post:' + rp.dataset.targetId) {
        U.closeSheet();
      } else if (U.openSheetId && U.openSheetId.startsWith('comm-post:')) {
        U.openPost(U.openSheetId.slice('comm-post:'.length));
      }
      if (U.route === 'comm') U.render();
      return;
    }

    const ag = e.target.closest('[data-comm-ask-agri]');
    if (ag) {
      e.stopPropagation();
      U.askAgriOnPost(ag.dataset.commAskAgri);
      return;
    }

    const op = e.target.closest('[data-comm-open]');
    if (op) {
      U.commState.replyParentId = null;
      U.commState.replyParentAuthor = '';
      await C.refreshComments(op.dataset.commOpen);
      U.openPost(op.dataset.commOpen);
      return;
    }

    const rto = e.target.closest('[data-comm-reply-to]');
    if (rto) {
      U.commState.replyParentId = rto.dataset.commReplyTo;
      U.commState.replyParentAuthor = rto.dataset.commReplyAuthor || '';
      if (U.commState.openPostId) U.openPost(U.commState.openPostId);
      setTimeout(() => { const inp = $('comm-reply-input'); if (inp) inp.focus(); }, 40);
      return;
    }

    const cr = e.target.closest('[data-comm-cancel-reply]');
    if (cr) {
      U.commState.replyParentId = null;
      U.commState.replyParentAuthor = '';
      if (U.commState.openPostId) U.openPost(U.commState.openPostId);
      return;
    }

    const ds = e.target.closest('[data-dictate-sheet]');
    if (ds) {
      const inp = $(ds.dataset.dictateSheet);
      if (inp && E.voice && E.voice.sttSupported) E.voice.dictate(inp);
      return;
    }

    const srp = e.target.closest('[data-comm-send-reply]');
    if (srp) {
      const pid = srp.dataset.commSendReply;
      const inp = $('comm-reply-input');
      const val = inp ? inp.value.trim() : '';
      if (!val) { if (inp) inp.focus(); return; }
      await C.addComment({
        postId: pid,
        parentId: U.commState.replyParentId || null,
        body: val
      });
      U.commState.replyParentId = null;
      U.commState.replyParentAuthor = '';
      U.openPost(pid);
      if (U.route === 'comm') U.render();
      return;
    }
  });

  document.addEventListener('community-updated', () => {
    if (U.route === 'comm') U.render();
  });
})();
