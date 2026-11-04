// لوحة الإدارة — Admin panel: live control + question bank management
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^(https?:\/\/|\/)/i.test(String(u || '')) ? String(u) : '');
  const LANGS = ['ar', 'fr', 'en'];
  const DIFF = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
  const STATUS = { published: 'منشور', review: 'قيد المراجعة', draft: 'مسودة' };
  const REGION = { arab: 'عربي ومغربي', world: 'عالمي', foreign: 'أجنبي متنوع' };
  const TYPE = {
    mcq: 'أربعة اختيارات', open: 'إجابة مباشرة', complete: 'أكمل العبارة', image_person: 'شخصية من صورة', image_player: 'لاعب من صورته',
    logo: 'شعار نادٍ', flag: 'علم دولة', landmark: 'معلم سياحي', map: 'دولة من الخريطة',
  };
  const PHASE = { idle: 'في الانتظار', countdown: 'العد التنازلي', question: 'السؤال مفتوح', reveal: 'كشف الجواب', finished: 'انتهت الجولة' };

  let token = '';
  try { token = localStorage.getItem('quizAdminToken') || ''; } catch { /* storage unavailable */ }
  let meta = null;
  let questions = [];
  let editing = null;

  function snack(msg) {
    const el = $('#snack');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(snack.t);
    snack.t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const isJson = (res.headers.get('content-type') || '').includes('json');
    const data = isJson ? await res.json() : await res.text();
    if (res.status === 401) { showLogin('انتهت الجلسة أو الرمز غير صحيح'); throw new Error('unauthorized'); }
    if (!res.ok) throw Object.assign(new Error((data && (data.error || (data.errors || []).join(' · '))) || res.statusText), { data });
    return data;
  }

  const catName = (id) => { const c = meta.categories.find((x) => x.id === id); return c ? `${c.icon} ${c.name.ar}` : id; };
  const subName = (cid, sid) => meta.categories.find((x) => x.id === cid)?.subcategories.find((s) => s.id === sid)?.name.ar || sid || '';
  const answerText = (q) => (q.choices.length ? q.choices[q.correct]?.ar || q.choices[q.correct]?.en || '—' : (q.answers.ar[0] || q.answers.fr[0] || q.answers.en[0] || '—'));

  // ---------------- Login ----------------
  function showLogin(err = '') {
    $('#login').hidden = false;
    $('#main').hidden = true;
    $('#loginErr').textContent = err;
  }
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    token = $('#tokenInput').value.trim();
    try { await api('/api/auth'); } catch { return; }
    try { localStorage.setItem('quizAdminToken', token); } catch { /* ignore */ }
    start();
  };

  async function start() {
    $('#login').hidden = true;
    $('#main').hidden = false;
    meta = await (await fetch('/api/meta')).json();
    buildPickers();
    connectEvents();
    await loadQuestions();
    preview();
  }

  // ---------------- Tabs ----------------
  $$('#tabs button').forEach((b) => (b.onclick = () => {
    $$('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
    if (b.dataset.tab === 'stats') loadStats();
    if (b.dataset.tab === 'review') renderReview();
  }));

  // ---------------- Live control ----------------
  function buildPickers() {
    $('#catPicker').innerHTML = meta.categories.map((c) => `
      <div class="cat-box" data-cat="${esc(c.id)}">
        <label class="check"><input type="checkbox" class="cat" value="${esc(c.id)}" checked> ${esc(c.icon)} <b>${esc(c.name.ar)}</b></label>
        <div class="subs">${c.subcategories.map((s) => `<label class="check"><input type="checkbox" class="sub" value="${esc(c.id)}/${esc(s.id)}" checked> ${esc(s.name.ar)}</label>`).join('')}</div>
      </div>`).join('');
    $('#typePicker').innerHTML = meta.types.map((t) => `<label class="check"><input type="checkbox" name="type" value="${t}" checked> ${TYPE[t] || t}</label>`).join('');
    const catOptions = meta.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name.ar)}</option>`).join('');
    $('#fCategory').insertAdjacentHTML('beforeend', catOptions);
    $('#fType').insertAdjacentHTML('beforeend', meta.types.map((t) => `<option value="${t}">${TYPE[t] || t}</option>`).join(''));
    $('[name=category]', $('#qForm')).innerHTML = catOptions;
    $('[name=type]', $('#qForm')).innerHTML = meta.types.map((t) => `<option value="${t}">${TYPE[t] || t}</option>`).join('');

    $('#catPicker').addEventListener('change', (e) => {
      const box = e.target.closest('.cat-box');
      if (e.target.classList.contains('cat')) $$('.sub', box).forEach((s) => (s.checked = e.target.checked));
      if (e.target.classList.contains('sub') && e.target.checked) $('.cat', box).checked = true;
      box.classList.toggle('off', !$('.cat', box).checked);
      preview();
    });
    ['#sCount', '#sProgressive'].forEach((s) => $(s).addEventListener('change', preview));
    $$('[name=diff], [name=type]').forEach((el) => el.addEventListener('change', preview));
  }

  $('#randomAll').onclick = () => { $$('#catPicker input').forEach((i) => (i.checked = true)); $$('.cat-box').forEach((b) => b.classList.remove('off')); preview(); };
  $('#clearCats').onclick = () => { $$('#catPicker input').forEach((i) => (i.checked = false)); $$('.cat-box').forEach((b) => b.classList.add('off')); preview(); };

  function settings() {
    const cats = $$('.cat').filter((c) => c.checked).map((c) => c.value);
    const allCats = cats.length === meta.categories.length;
    const excludeSubcategories = $$('.sub').filter((s) => !s.checked && $(`.cat[value="${s.value.split('/')[0]}"]`).checked).map((s) => s.value);
    const diffs = $$('[name=diff]').filter((c) => c.checked).map((c) => c.value);
    const types = $$('[name=type]').filter((c) => c.checked).map((c) => c.value);
    return {
      categories: allCats ? [] : cats.length ? cats : ['__none__'],
      excludeSubcategories,
      difficulties: diffs.length === 3 ? [] : diffs.length ? diffs : ['__none__'],
      types: types.length === meta.types.length ? [] : types.length ? types : ['__none__'],
      count: Number($('#sCount').value),
      duration: Number($('#sDuration').value),
      revealDuration: Number($('#sReveal').value),
      lang: $('#sLang').value,
      mode: $('#sMode').value,
      progressive: $('#sProgressive').checked,
      autoAdvance: $('#sAuto').checked,
    };
  }

  async function preview() {
    try {
      const s = await api('/api/game/preview', { method: 'POST', body: settings() });
      const by = s.byRegion || {};
      $('#previewInfo').innerHTML = `متاح: <b>${s.pool}</b> سؤال منشور · الجولة ستضم <b>${s.returned}</b> / ${s.requested}`
        + ` — عربي ومغربي ${by.arab || 0} · عالمي ${by.world || 0} · أجنبي ${by.foreign || 0}`
        + (s.returned < s.requested ? ' <span class="err">(عدد الأسئلة المتاحة أقل من المطلوب)</span>' : '');
    } catch { /* ignore */ }
  }

  $('#btnStart').onclick = async () => {
    $('#liveMsg').textContent = '';
    try { await api('/api/game/start', { method: 'POST', body: settings() }); snack('بدأت الجولة 🎉'); } catch (e) { $('#liveMsg').textContent = e.message; }
  };
  $('#btnNext').onclick = () => api('/api/game/next', { method: 'POST' }).catch(() => {});
  $('#btnStop').onclick = () => api('/api/game/stop', { method: 'POST' }).catch(() => {});
  $('#btnResetScores').onclick = () => { if (confirm('تصفير نقاط الجولة والجلسة؟')) api('/api/game/reset-scores', { method: 'POST' }); };

  $('#ttForm').onsubmit = async (e) => {
    e.preventDefault();
    $('#ttStatus').textContent = 'جارٍ الاتصال…';
    try { await api('/api/tiktok/connect', { method: 'POST', body: { username: $('#ttUser').value } }); } catch (err) { $('#ttStatus').textContent = `❌ ${err.message}`; }
  };
  $('#ttOff').onclick = () => api('/api/tiktok/disconnect', { method: 'POST' });

  $('#simForm').onsubmit = async (e) => {
    e.preventDefault();
    await api('/api/simulate', { method: 'POST', body: { nickname: $('#simName').value, text: $('#simText').value } });
    $('#simText').value = '';
    $('#simText').focus();
  };

  function boardHtml(list) {
    return list.map((e) => `<li>${esc(e.nickname)} — <b>${e.points}</b> نقطة (${e.correct} ✔)</li>`).join('') || '<li class="muted">لا يوجد مشاركون بعد</li>';
  }

  async function renderLive(st) {
    const q = st.question;
    let html = `<div><span class="phase">${PHASE[st.phase] || st.phase}</span> ${st.total ? `· السؤال ${st.index + 1} / ${st.total}` : ''}</div>`;
    if (q) {
      html += `<div class="q">${esc(q.text.ar || q.text.fr || q.text.en)}</div>`;
      html += `<div class="muted">${esc(catName(q.category))} · ${DIFF[q.difficulty]} · ${TYPE[q.type] || q.type} · محاولات: ${q.answersCount}</div>`;
    }
    if (st.phase === 'reveal' && st.result) {
      html += st.result.winner ? `<div>👑 الفائز: <b>${esc(st.result.winner.nickname)}</b> +${st.result.winner.points}</div>` : '<div class="muted">لا يوجد فائز</div>';
    }
    if (st.phase === 'finished' && st.final?.champion) html += `<div>🏆 بطل الجولة: <b>${esc(st.final.champion.nickname)}</b> (${st.final.champion.points} نقطة)</div>`;
    $('#liveState').innerHTML = html;
    $('#liveBoard').innerHTML = boardHtml(st.leaderboard);
    $('#sessionBoard').innerHTML = boardHtml(st.sessionLeaderboard);
    if (st.phase === 'question') {
      try {
        const a = await api('/api/game/current-answer');
        const letters = ['أ', 'ب', 'ج', 'د'];
        $('#hostAnswer').textContent = a.correctIndex != null ? `🔑 الجواب (للمقدم فقط): ${letters[a.correctIndex]} — ${a.accepted[0] || ''}` : `🔑 الجواب (للمقدم فقط): ${a.accepted.slice(0, 3).join(' / ')}`;
      } catch { /* ignore */ }
    } else $('#hostAnswer').textContent = '';
  }

  function connectEvents() {
    const es = new EventSource('/events');
    es.addEventListener('state', (e) => renderLive(JSON.parse(e.data)));
    es.addEventListener('tiktok', (e) => {
      const s = JSON.parse(e.data);
      $('#ttStatus').textContent = s.connected ? `✅ متصل بـ @${s.username}${s.viewers ? ` · ${s.viewers} مشاهد` : ''}` : s.error ? `⚠️ ${s.error}` : 'غير متصل';
    });
    es.addEventListener('comment', (e) => {
      const c = JSON.parse(e.data);
      const li = document.createElement('li');
      if (c.correct) li.className = 'ok';
      li.innerHTML = `${c.correct ? '✅ ' : ''}<b>${esc(c.nickname)}</b>${c.simulated ? ' <span class="muted">(تجربة)</span>' : ''}: ${esc(c.text)}`;
      $('#comments').prepend(li);
      while ($('#comments').children.length > 60) $('#comments').lastChild.remove();
    });
  }

  // ---------------- Question bank ----------------
  async function loadQuestions() {
    const data = await api('/api/questions');
    questions = data.questions;
    renderBank();
    const reviewN = questions.filter((q) => q.status === 'review').length;
    $('#reviewCount').textContent = reviewN || '';
    if ($('#tab-review').classList.contains('active')) renderReview();
  }

  function issuesIcons(q) {
    const v = q.validation;
    const blocking = q.status === 'published' ? v.errors : v.structural;
    let s = '';
    if (!v.publishable) s += ` <span class="flage" title="${esc(v.errors.join('\n'))}">⛔</span>`;
    const realWarnings = v.warnings.filter((w) => !w.startsWith('ترجمة') && !w.startsWith('الإجابة ناقصة'));
    if (realWarnings.length) s += ` <span class="flagw" title="${esc(realWarnings.join('\n'))}">⚠️</span>`;
    return blocking.length || s ? s : '';
  }

  function renderBank() {
    const f = {
      q: $('#fSearch').value.trim().toLowerCase(), category: $('#fCategory').value, status: $('#fStatus').value,
      difficulty: $('#fDifficulty').value, region: $('#fRegion').value, type: $('#fType').value,
    };
    const list = questions.filter((q) =>
      (!f.category || q.category === f.category) && (!f.status || q.status === f.status) && (!f.difficulty || q.difficulty === f.difficulty) &&
      (!f.region || q.region === f.region) && (!f.type || q.type === f.type) &&
      (!f.q || JSON.stringify([q.id, q.text, q.choices, q.answers, q.tags]).toLowerCase().includes(f.q)));
    $('#bankCount').textContent = `${list.length} سؤال`;
    $('#bankBody').innerHTML = list.map((q) => `
      <tr data-id="${esc(q.id)}">
        <td class="q">${q.image ? '🖼️ ' : ''}${q.volatile ? '⏳ ' : ''}${esc(q.text.ar || q.text.fr || q.text.en)}${issuesIcons(q)}<small>${esc(q.id)}</small></td>
        <td>${esc(answerText(q))}</td>
        <td>${esc(catName(q.category))}<br><span class="muted small">${esc(subName(q.category, q.subcategory))} · ${REGION[q.region] || q.region}</span></td>
        <td>${DIFF[q.difficulty] || q.difficulty}</td>
        <td>${TYPE[q.type] || q.type}</td>
        <td><span class="status ${q.status}">${STATUS[q.status]}</span></td>
        <td class="actions">
          <button class="btn small" data-act="edit">✏️</button>
          ${q.status !== 'published' ? '<button class="btn small" data-act="publish" title="نشر">✅</button>' : '<button class="btn small" data-act="unpublish" title="إرجاع للمراجعة">↩️</button>'}
          <button class="btn small danger" data-act="delete" title="حذف">🗑️</button>
        </td>
      </tr>`).join('');
  }
  ['#fSearch', '#fCategory', '#fStatus', '#fDifficulty', '#fRegion', '#fType'].forEach((s) => $(s).addEventListener('input', renderBank));

  async function questionAction(id, act) {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    try {
      if (act === 'edit') return openEditor(q);
      if (act === 'delete') {
        if (!confirm(`حذف السؤال نهائياً؟\n\n${q.text.ar || q.text.en}`)) return;
        await api(`/api/questions/${encodeURIComponent(id)}`, { method: 'DELETE' });
        snack('تم الحذف');
      }
      if (act === 'publish') { await api(`/api/questions/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status: 'published' } }); snack('تم النشر ✅'); }
      if (act === 'unpublish') { await api(`/api/questions/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status: 'review' } }); snack('أُعيد للمراجعة'); }
      if (act === 'draft') { await api(`/api/questions/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status: 'draft' } }); snack('نُقل إلى المسودات'); }
      if (act === 'verify') {
        await api(`/api/questions/${encodeURIComponent(id)}`, { method: 'PUT', body: { ...q, verifiedAt: new Date().toISOString().slice(0, 10) } });
        snack('تم تحديث تاريخ التحقق');
      }
      await loadQuestions();
    } catch (e) {
      alert(`تعذر تنفيذ العملية:\n${e.message}`);
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const holder = b.closest('[data-id]');
    if (holder) questionAction(holder.dataset.id, b.dataset.act);
  });

  // ---------------- Review ----------------
  function reviewCard(q, actions) {
    const v = q.validation;
    const choices = q.choices.length
      ? `<ul>${q.choices.map((c, i) => `<li class="${i === q.correct ? 'good' : ''}">${esc(c.ar || c.en)}${i === q.correct ? ' ✔' : ''}</li>`).join('')}</ul>`
      : `<div>الأجوبة: <span class="good">${esc([...q.answers.ar, ...q.answers.fr, ...q.answers.en].join(' / '))}</span></div>`;
    const src = q.source.url ? `<a href="${esc(safeUrl(q.source.url))}" target="_blank" rel="noopener noreferrer">${esc(q.source.title || q.source.url)}</a>` : esc(q.source.title || '— لا يوجد مصدر —');
    const issues = [...v.errors.map((x) => `<div class="e">⛔ ${esc(x)}</div>`), ...v.warnings.filter((w) => !w.startsWith('ترجمة')).map((x) => `<div class="w">⚠️ ${esc(x)}</div>`)].join('');
    return `<div class="qcard" data-id="${esc(q.id)}">
      <div class="muted small">${esc(catName(q.category))} · ${DIFF[q.difficulty]} · ${TYPE[q.type] || q.type} · ${REGION[q.region]}${q.verifiedAt ? ` · آخر تحقق: ${esc(q.verifiedAt)}` : ''}</div>
      ${safeUrl(q.image) ? `<img src="${esc(safeUrl(q.image))}" alt="">` : ''}
      <div class="t">${esc(q.text.ar || q.text.fr || q.text.en)}</div>
      ${choices}
      <div class="small">المصدر: ${src}</div>
      ${q.notes ? `<div class="small muted">📝 ${esc(q.notes)}</div>` : ''}
      <div class="issues">${issues}</div>
      <div class="row wrap">${actions}</div>
    </div>`;
  }
  function renderReview() {
    const pending = questions.filter((q) => q.status === 'review');
    $('#reviewList').innerHTML = pending.map((q) => reviewCard(q, `
      <button class="btn small primary" data-act="publish" ${q.validation.publishable ? '' : 'disabled title="أصلح الأخطاء أولاً"'}>✅ نشر</button>
      <button class="btn small" data-act="edit">✏️ تعديل</button>
      <button class="btn small" data-act="draft">↩️ مسودة</button>
      <button class="btn small danger" data-act="delete">🗑️ حذف</button>`)).join('') || '<p class="muted">لا توجد أسئلة بانتظار المراجعة 🎉</p>';
    const stale = questions.filter((q) => q.volatile && q.validation.warnings.some((w) => w.includes('آخر تحقق قديم')));
    $('#staleList').innerHTML = stale.map((q) => reviewCard(q, `
      <button class="btn small primary" data-act="verify">🔄 تم التحقق اليوم</button>
      <button class="btn small" data-act="edit">✏️ تعديل الجواب</button>
      <button class="btn small danger" data-act="delete">🗑️ حذف</button>`)).join('') || '<p class="muted">كل المعلومات المتغيرة محدثة ✅</p>';
  }

  // ---------------- Editor ----------------
  const form = $('#qForm');
  const dlg = $('#editor');
  $('#btnNew').onclick = () => openEditor(null);
  $$('[data-close]', dlg).forEach((b) => (b.onclick = () => dlg.close()));

  function choiceRows(choices = [], correct = 0) {
    $('#choiceRows').innerHTML = [0, 1, 2, 3].map((i) => `
      <div class="choice-row">
        <input type="radio" name="correct" value="${i}" ${i === correct ? 'checked' : ''} title="الاختيار الصحيح">
        <input data-choice="${i}" data-lang="ar" dir="rtl" placeholder="الاختيار ${i + 1} (عربي)" value="${esc(choices[i]?.ar || '')}">
        <input data-choice="${i}" data-lang="fr" dir="ltr" placeholder="Choix ${i + 1}" value="${esc(choices[i]?.fr || '')}">
        <input data-choice="${i}" data-lang="en" dir="ltr" placeholder="Choice ${i + 1}" value="${esc(choices[i]?.en || '')}">
      </div>`).join('');
  }

  function fillSubcats(cat, selected = '') {
    const c = meta.categories.find((x) => x.id === cat);
    form.subcategory.innerHTML = '<option value="">—</option>' + (c?.subcategories || []).map((s) => `<option value="${esc(s.id)}" ${s.id === selected ? 'selected' : ''}>${esc(s.name.ar)}</option>`).join('');
  }
  form.category.onchange = () => fillSubcats(form.category.value);

  function syncAnswerMode() {
    const t = form.type.value;
    const cb = $('#useChoices');
    if (t === 'mcq') { cb.checked = true; cb.disabled = true; } else if (t === 'open' || t === 'complete') { cb.checked = false; cb.disabled = true; } else cb.disabled = false;
    $('#choicesBox').hidden = !cb.checked;
    $('#answersBox').hidden = cb.checked;
  }
  form.type.onchange = syncAnswerMode;
  $('#useChoices').onchange = syncAnswerMode;

  function showImage(url) {
    const u = safeUrl(url);
    $('#imgPreview').hidden = !u;
    if (u) $('#imgPreview').src = u;
  }
  form.image.oninput = () => showImage(form.image.value);
  $('#imgFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) return alert('حجم الصورة أكبر من 3MB');
    const dataUrl = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    try {
      const { url } = await api('/api/upload', { method: 'POST', body: { dataUrl } });
      form.image.value = url;
      showImage(url);
      snack('تم رفع الصورة');
    } catch (err) { alert(err.message); }
    e.target.value = '';
  };

  function openEditor(q) {
    editing = q;
    form.reset();
    $('#edTitle').textContent = q ? `تعديل: ${q.id}` : 'سؤال جديد';
    const d = q || { category: meta.categories[0].id, subcategory: '', region: 'arab', difficulty: 'easy', type: 'mcq', status: 'draft', text: {}, choices: [], correct: 0, answers: { ar: [], fr: [], en: [] }, source: {}, tags: [] };
    form.category.value = d.category;
    fillSubcats(d.category, d.subcategory);
    form.region.value = d.region;
    form.difficulty.value = d.difficulty;
    form.type.value = d.type;
    form.status.value = d.status;
    for (const l of LANGS) {
      form[`text_${l}`].value = d.text[l] || '';
      form[`answers_${l}`].value = (d.answers[l] || []).join('\n');
    }
    form.image.value = d.image || '';
    showImage(d.image);
    $('#useChoices').checked = d.choices.length > 0 || d.type === 'mcq';
    choiceRows(d.choices, d.correct ?? 0);
    form.source_title.value = d.source.title || '';
    form.source_url.value = d.source.url || '';
    form.factKey.value = d.factKey || '';
    form.tags.value = (d.tags || []).join('|');
    form.volatile.checked = !!d.volatile;
    form.verifiedAt.value = d.verifiedAt || '';
    form.notes.value = d.notes || '';
    syncAnswerMode();
    renderValidation(q?.validation);
    dlg.showModal();
  }

  function collect(status) {
    const useChoices = $('#useChoices').checked;
    const choices = useChoices ? [0, 1, 2, 3].map((i) => Object.fromEntries(LANGS.map((l) => [l, $(`[data-choice="${i}"][data-lang="${l}"]`).value.trim()]))) : [];
    const correctEl = form.querySelector('[name=correct]:checked');
    return {
      id: editing?.id,
      category: form.category.value, subcategory: form.subcategory.value, region: form.region.value,
      difficulty: form.difficulty.value, type: form.type.value, status,
      text: Object.fromEntries(LANGS.map((l) => [l, form[`text_${l}`].value.trim()])),
      image: form.image.value.trim(),
      choices,
      correct: useChoices && correctEl ? Number(correctEl.value) : null,
      answers: useChoices ? { ar: [], fr: [], en: [] } : Object.fromEntries(LANGS.map((l) => [l, form[`answers_${l}`].value.split('\n').map((x) => x.trim()).filter(Boolean)])),
      source: { title: form.source_title.value.trim(), url: form.source_url.value.trim() },
      factKey: form.factKey.value.trim(), tags: form.tags.value, notes: form.notes.value.trim(),
      volatile: form.volatile.checked, verifiedAt: form.verifiedAt.value,
    };
  }

  function renderValidation(v, extraErrors = []) {
    const errors = [...extraErrors, ...(v?.errors || [])];
    const warnings = v?.warnings || [];
    $('#edValidation').innerHTML = (errors.length ? `<ul>${[...new Set(errors)].map((e) => `<li class="e">⛔ ${esc(e)}</li>`).join('')}</ul>` : '')
      + (warnings.length ? `<ul>${warnings.map((w) => `<li class="w">⚠️ ${esc(w)}</li>`).join('')}</ul>` : '');
  }

  $$('[data-save]', form).forEach((b) => (b.onclick = async () => {
    const body = collect(b.dataset.save);
    try {
      const res = editing
        ? await api(`/api/questions/${encodeURIComponent(editing.id)}`, { method: 'PUT', body })
        : await api('/api/questions', { method: 'POST', body });
      snack(b.dataset.save === 'published' ? 'تم الحفظ والنشر ✅' : 'تم الحفظ');
      await loadQuestions();
      if (res.warnings?.length) { editing = res.question; renderValidation(res.question.validation); $('#edTitle').textContent = `تعديل: ${res.question.id}`; snack('تم الحفظ — راجع التنبيهات'); }
      else dlg.close();
    } catch (e) {
      renderValidation({ warnings: e.data?.warnings || [] }, e.data?.errors || [e.message]);
    }
  }));

  // ---------------- Import / Export ----------------
  $('#importFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    $('#importText').value = await f.text();
    $('#importFormat').value = f.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';
  };
  $('#btnImport').onclick = async () => {
    const content = $('#importText').value;
    if (!content.trim()) return;
    let format = $('#importFormat').value;
    if (format === 'auto') format = /^\s*[[{]/.test(content) ? 'json' : 'csv';
    try {
      const r = await api('/api/questions/import', { method: 'POST', body: { format, content, status: $('#importStatus').value, overwrite: $('#importOverwrite').checked } });
      $('#importResult').textContent = `✅ جديد: ${r.imported} · محدث: ${r.updated} · مرفوض: ${r.skipped.length}\n` + r.skipped.map((s) => `#${s.row} ${s.id}: ${s.errors.join(' | ')}`).join('\n');
      await loadQuestions();
    } catch (e) { $('#importResult').textContent = `❌ ${e.message}`; }
  };
  $$('[data-export]').forEach((b) => (b.onclick = async () => {
    const kind = b.dataset.export;
    const url = kind === 'template' ? '/api/questions/template.csv' : `/api/questions/export?format=${kind}`;
    const res = await fetch(url, { headers: { 'x-admin-token': token } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = kind === 'template' ? 'questions-template.csv' : `questions.${kind}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }));

  // ---------------- Stats ----------------
  async function loadStats() {
    const s = await api('/api/stats');
    const table = (title, obj, labels = {}) => {
      const total = Object.values(obj).reduce((a, b) => a + b, 0) || 1;
      return `<div class="stat-card"><h4>${title}</h4><table>${Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `
        <tr><td>${esc(labels[k] || k)}<div class="bar"><span style="width:${(100 * v / total).toFixed(0)}%"></span></div></td><td>${v}</td></tr>`).join('')}</table></div>`;
    };
    const pub = s.publishedByRegion;
    const totalPub = Object.values(pub).reduce((a, b) => a + b, 0) || 1;
    const pct = (k) => `${Math.round((100 * (pub[k] || 0)) / totalPub)}%`;
    const cats = Object.fromEntries(meta.categories.map((c) => [c.id, `${c.icon} ${c.name.ar}`]));
    $('#statsBox').innerHTML = `
      <p><b>${s.total}</b> سؤال في البنك · منشور: <b>${s.byStatus.published || 0}</b> · قيد المراجعة: ${s.byStatus.review || 0} · مسودة: ${s.byStatus.draft || 0} · معلومات متغيرة تحتاج تحقق: <b>${s.stale}</b></p>
      <p>النسب الثقافية للأسئلة المنشورة: عربي ومغربي <b>${pct('arab')}</b> · عالمي <b>${pct('world')}</b> · أجنبي <b>${pct('foreign')}</b> <span class="muted">(الهدف 65% / 25% / 10% — يطبقه نظام الاختيار في كل جولة)</span></p>
      <div class="stats-grid">
        ${table('التصنيفات', s.byCategory, cats)}
        ${table('المناطق الثقافية', s.byRegion, REGION)}
        ${table('الصعوبة', s.byDifficulty, DIFF)}
        ${table('أنواع الأسئلة', s.byType, TYPE)}
      </div>`;
  }

  // ---------------- Boot ----------------
  if (token) api('/api/auth').then(start).catch(() => showLogin());
  else showLogin();
})();
