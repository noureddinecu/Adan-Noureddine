import { useEffect, useMemo, useState } from 'react';
import { api, del, download, fileToDataUrl, post, put } from '../../shared/api';
import { useI18n } from '../../shared/i18n';
import { Empty, Section, Segmented, Sheet, cx, toast } from '../../shared/ui';
import type { Question, T3 } from '../../shared/types';
import { useApp } from '../ctx';
import { typeLabel } from './Live';

type Sub = 'bank' | 'review' | 'facts' | 'io';
const LANGS = ['ar', 'fr', 'en'] as const;

export default function QuestionsPage() {
  const { t } = useI18n();
  const [sub, setSub] = useState<Sub>('bank');
  const [list, setList] = useState<Question[] | null>(null);
  const [editing, setEditing] = useState<Question | 'new' | null>(null);
  const load = () => api<{ questions: Question[] }>('/api/questions').then((r) => setList(r.questions)).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, []);
  const review = list?.filter((q) => q.status === 'review') || [];
  const stale = list?.filter((q) => q.volatile) || [];
  return (
    <div className="grid gap-4">
      <Segmented value={sub} onChange={setSub} options={[
        { value: 'bank', label: `📚 ${t('bank')}` },
        { value: 'review', label: `✅ ${t('review')}${review.length ? ` (${review.length})` : ''}` },
        { value: 'facts', label: `⏳ ${t('sportsFacts')}` },
        { value: 'io', label: `📥 ${t('importExport')}` },
      ]} />
      {!list ? <Empty>…</Empty> : (
        <>
          {sub === 'bank' && <Bank list={list} onEdit={setEditing} />}
          {sub === 'review' && <ReviewList list={review} onEdit={setEditing} onChanged={load} empty={t('reviewEmpty')} />}
          {sub === 'facts' && (<><p className="text-sm muted">{t('staleNote')}</p><ReviewList list={stale} onEdit={setEditing} onChanged={load} empty={t('staleEmpty')} facts /></>)}
          {sub === 'io' && <ImportExport onChanged={load} />}
        </>
      )}
      {editing && <Editor q={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { load(); }} />}
    </div>
  );
}

function useLabels() {
  const { meta } = useApp();
  const { t, tr } = useI18n();
  const cat = (id: string) => { const c = meta.categories.find((x) => x.id === id); return c ? `${c.icon} ${tr(c.name)}` : id; };
  const sub = (cid: string, sid: string) => tr(meta.categories.find((x) => x.id === cid)?.subcategories.find((s) => s.id === sid)?.name) || sid;
  const answer = (q: Question) => (q.choices.length ? tr(q.choices[q.correct ?? 0]) : q.answers.ar[0] || q.answers.en[0] || q.answers.fr[0] || '—');
  return { cat, sub, answer, t, tr };
}

function StatusBadge({ s }: { s: string }) {
  const { t } = useI18n();
  return <span className={cx('badge', s === 'published' ? 'bg-ok/20 text-ok' : s === 'review' ? 'bg-gold/20 text-gold' : 'bg-white/10 text-white/60')}>{t('s_' + s)}</span>;
}

function Bank({ list, onEdit }: { list: Question[]; onEdit: (q: Question | 'new') => void }) {
  const { meta } = useApp();
  const { cat, answer, t, tr } = useLabels();
  const [q, setQ] = useState('');
  const [f, setF] = useState({ category: '', status: '', difficulty: '', type: '' });
  const [limit, setLimit] = useState(40);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return list.filter((x) => (!f.category || x.category === f.category) && (!f.status || x.status === f.status) && (!f.difficulty || x.difficulty === f.difficulty) && (!f.type || x.type === f.type)
      && (!needle || JSON.stringify([x.id, x.text, x.choices, x.answers, x.tags]).toLowerCase().includes(needle)));
  }, [list, q, f]);
  const sel = (k: keyof typeof f, opts: [string, string][]) => (
    <select className="input !py-2 !w-auto text-sm" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
      {opts.map(([v, l]) => <option key={v} value={v} className="bg-ink">{l}</option>)}
    </select>
  );
  return (
    <>
      <div className="grid gap-2">
        <input className="input" placeholder={`🔍 ${t('search')}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {sel('category', [['', t('categories')], ...meta.categories.map((c) => [c.id, `${c.icon} ${tr(c.name)}`] as [string, string])])}
          {sel('status', [['', t('status')], ['published', t('s_published')], ['review', t('s_review')], ['draft', t('s_draft')]])}
          {sel('difficulty', [['', t('difficulty')], ['easy', t('easy')], ['medium', t('medium')], ['hard', t('hard')]])}
          {sel('type', [['', t('type')], ...meta.types.map((x) => [x, typeLabel(x, t)] as [string, string])])}
        </div>
        <div className="text-xs muted">{filtered.length} {t('results')}</div>
      </div>
      <div className="grid gap-2">
        {filtered.slice(0, limit).map((x) => (
          <button key={x.id} onClick={() => onEdit(x)} className="glass !rounded-2xl p-3 text-start flex gap-3 items-start active:scale-[.99] transition">
            {x.image && (x.type === 'map' ? <div className="map-shape w-12 h-12 shrink-0" style={{ ['--map' as any]: `url("${x.image}")` }} /> : <img src={x.image} alt="" className="w-12 h-12 object-contain rounded-lg bg-white/5 shrink-0" />)}
            <div className="min-w-0 flex-1">
              <div className="font-semibold leading-snug line-clamp-2">{x.volatile && '⏳ '}{tr(x.text)}</div>
              <div className="text-xs text-ok mt-0.5 truncate">✓ {answer(x)}</div>
              <div className="flex flex-wrap gap-1 mt-1.5 text-[11px]">
                <StatusBadge s={x.status} />
                <span className="badge bg-white/10">{cat(x.category)}</span>
                <span className="badge bg-white/10">{t(x.difficulty)}</span>
                <span className="badge bg-white/10">{typeLabel(x.type, t)}</span>
                {!x.validation?.publishable && <span className="badge bg-bad/20 text-bad">⛔ {x.validation?.errors.length}</span>}
              </div>
            </div>
          </button>
        ))}
        {filtered.length > limit && <button className="btn-soft" onClick={() => setLimit(limit + 60)}>{t('loadMore')}</button>}
      </div>
      <button className="fixed bottom-24 lg:bottom-8 end-5 z-30 btn-primary rounded-full w-14 h-14 text-3xl !p-0 shadow-glow" onClick={() => onEdit('new')} aria-label={t('newQuestion')}>+</button>
    </>
  );
}

function ReviewList({ list, onEdit, onChanged, empty, facts = false }: { list: Question[]; onEdit: (q: Question) => void; onChanged: () => void; empty: string; facts?: boolean }) {
  const { cat, t, tr } = useLabels();
  const act = async (q: Question, a: 'publish' | 'draft' | 'delete' | 'verify') => {
    try {
      if (a === 'delete') { if (!confirm(t('confirmDelete'))) return; await del(`/api/questions/${encodeURIComponent(q.id)}`); }
      else if (a === 'verify') await post(`/api/questions/${encodeURIComponent(q.id)}/verify`);
      else await post(`/api/questions/${encodeURIComponent(q.id)}/status`, { status: a === 'publish' ? 'published' : 'draft' });
      toast(t('saved'));
      onChanged();
    } catch (e: any) { toast(e.message, 'err'); }
  };
  if (!list.length) return <Empty>{empty}</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {list.map((q) => (
        <div key={q.id} className="card grid gap-2">
          <div className="flex flex-wrap gap-1 text-[11px]"><StatusBadge s={q.status} /><span className="badge bg-white/10">{cat(q.category)}</span>{q.verifiedAt && <span className="badge bg-white/10">✔ {q.verifiedAt}</span>}</div>
          {q.image && <img src={q.image} alt="" className="max-h-20 w-fit rounded-lg" />}
          <div className="font-bold">{tr(q.text)}</div>
          {q.choices.length ? (
            <ul className="text-sm grid gap-0.5">{q.choices.map((c, i) => <li key={i} className={i === q.correct ? 'text-ok font-bold' : 'muted'}>{i === q.correct ? '✓ ' : '• '}{tr(c)}</li>)}</ul>
          ) : <div className="text-sm text-ok font-bold">✓ {[...q.answers.ar, ...q.answers.fr, ...q.answers.en].join(' / ')}</div>}
          <div className="text-xs muted">📖 {q.source.url ? <a className="underline" href={q.source.url} target="_blank" rel="noopener noreferrer">{q.source.title || q.source.url}</a> : q.source.title || '—'}</div>
          {q.notes && <div className="text-xs muted">📝 {q.notes}</div>}
          <Issues q={q} />
          <div className="flex flex-wrap gap-2">
            {facts ? <button className="btn-ok btn-sm" onClick={() => act(q, 'verify')}>🔄 {t('verifyToday')}</button> : null}
            {q.status !== 'published' && <button className="btn-primary btn-sm" disabled={!q.validation?.publishable} onClick={() => act(q, 'publish')}>✅ {t('publish')}</button>}
            <button className="btn-soft btn-sm" onClick={() => onEdit(q)}>✏️ {t('edit')}</button>
            {!facts && <button className="btn-soft btn-sm" onClick={() => act(q, 'draft')}>↩ {t('toDraft')}</button>}
            <button className="btn-danger btn-sm" onClick={() => act(q, 'delete')}>🗑</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Issues({ q }: { q: Question }) {
  const v = q.validation;
  if (!v) return null;
  const w = v.warnings.filter((x) => !x.startsWith('ترجمة') && !x.startsWith('الإجابة ناقصة'));
  if (!v.errors.length && !w.length) return null;
  return (
    <div className="text-xs grid gap-0.5">
      {v.errors.map((e) => <div key={e} className="text-bad">⛔ {e}</div>)}
      {w.map((e) => <div key={e} className="text-gold">⚠️ {e}</div>)}
    </div>
  );
}

const emptyQ = (category: string): Question => ({
  id: '', category, subcategory: '', region: 'arab', difficulty: 'easy', type: 'mcq', text: { ar: '', fr: '', en: '' }, image: '',
  choices: [0, 1, 2, 3].map(() => ({ ar: '', fr: '', en: '' })), correct: 0, answers: { ar: [], fr: [], en: [] }, source: { title: '', url: '' },
  factKey: '', volatile: false, verifiedAt: '', tags: [], notes: '', status: 'draft', createdAt: '', updatedAt: '',
});

function Editor({ q, onClose, onSaved }: { q: Question | null; onClose: () => void; onSaved: () => void }) {
  const { meta } = useApp();
  const { t, tr } = useI18n();
  const [d, setD] = useState<Question>(() => {
    const base = q ? structuredClone(q) : emptyQ(meta.categories[0].id);
    if (base.choices.length === 0) base.choices = [0, 1, 2, 3].map(() => ({ ar: '', fr: '', en: '' }));
    return base;
  });
  const [useChoices, setUseChoices] = useState(q ? q.choices.length > 0 : true);
  const [answersText, setAnswersText] = useState<Record<string, string>>(() => Object.fromEntries(LANGS.map((l) => [l, (q?.answers[l] || []).join('\n')])));
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>(q?.validation?.warnings || []);
  const [busy, setBusy] = useState(false);
  const cat = meta.categories.find((c) => c.id === d.category);
  const forced = d.type === 'mcq' ? true : d.type === 'open' || d.type === 'complete' ? false : null;
  const choicesOn = forced ?? useChoices;
  const set = (patch: Partial<Question>) => setD((x) => ({ ...x, ...patch }));
  const setText = (l: keyof T3, v: string) => set({ text: { ...d.text, [l]: v } });
  const setChoice = (i: number, l: keyof T3, v: string) => set({ choices: d.choices.map((c, j) => (j === i ? { ...c, [l]: v } : c)) });

  const upload = async (file?: File) => {
    if (!file) return;
    try { const { url } = await post('/api/upload', { dataUrl: await fileToDataUrl(file) }); set({ image: url }); toast(t('saved')); } catch (e: any) { toast(e.message, 'err'); }
  };

  const save = async (status: string) => {
    setBusy(true); setErrors([]);
    const body = {
      ...d, status,
      choices: choicesOn ? d.choices : [],
      correct: choicesOn ? d.correct ?? 0 : null,
      answers: choicesOn ? { ar: [], fr: [], en: [] } : Object.fromEntries(LANGS.map((l) => [l, answersText[l].split('\n').map((x) => x.trim()).filter(Boolean)])),
    };
    try {
      const r = q ? await put(`/api/questions/${encodeURIComponent(q.id)}`, body) : await post('/api/questions', body);
      toast(t('saved'));
      onSaved();
      if (r.warnings?.filter((w: string) => !w.startsWith('ترجمة') && !w.startsWith('الإجابة ناقصة')).length) { setWarnings(r.warnings); setD(r.question); }
      else onClose();
    } catch (e: any) {
      setErrors(e.data?.errors || [e.message]);
      setWarnings(e.data?.warnings || []);
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!q || !confirm(t('confirmDelete'))) return;
    await del(`/api/questions/${encodeURIComponent(q.id)}`);
    onSaved(); onClose();
  };
  const opt = (v: string, l: string) => <option key={v} value={v} className="bg-ink">{l}</option>;
  return (
    <Sheet open onClose={onClose} wide title={q ? `✏️ ${q.id}` : `➕ ${t('newQuestion')}`} footer={(
      <>
        {q && <button className="btn-danger me-auto" onClick={remove}>🗑 {t('delete')}</button>}
        <button className="btn-soft" disabled={busy} onClick={() => save('draft')}>{t('saveDraft')}</button>
        <button className="btn-soft" disabled={busy} onClick={() => save('review')}>{t('sendReview')}</button>
        <button className="btn-primary" disabled={busy} onClick={() => save('published')}>✅ {t('savePublish')}</button>
      </>
    )}>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <label className="label">{t('category')}<select className="input" value={d.category} onChange={(e) => set({ category: e.target.value, subcategory: '' })}>{meta.categories.map((c) => opt(c.id, `${c.icon} ${tr(c.name)}`))}</select></label>
          <label className="label">{t('subcategory')}<select className="input" value={d.subcategory} onChange={(e) => set({ subcategory: e.target.value })}>{opt('', '—')}{cat?.subcategories.map((s) => opt(s.id, tr(s.name)))}</select></label>
          <label className="label">{t('region')}<select className="input" value={d.region} onChange={(e) => set({ region: e.target.value })}>{opt('arab', t('arabRegion'))}{opt('world', t('worldRegion'))}{opt('foreign', t('foreignRegion'))}</select></label>
          <label className="label">{t('difficulty')}<select className="input" value={d.difficulty} onChange={(e) => set({ difficulty: e.target.value })}>{['easy', 'medium', 'hard'].map((x) => opt(x, t(x)))}</select></label>
          <label className="label">{t('type')}<select className="input" value={d.type} onChange={(e) => set({ type: e.target.value })}>{meta.types.map((x) => opt(x, typeLabel(x, t)))}</select></label>
          <div className="label">{t('status')}<div className="pt-2"><StatusBadge s={d.status} /></div></div>
        </div>

        <fieldset className="grid gap-2">
          <legend className="font-bold mb-1">{t('questionText')}</legend>
          {LANGS.map((l) => <textarea key={l} className="input" rows={2} dir={l === 'ar' ? 'rtl' : 'ltr'} placeholder={l.toUpperCase()} value={d.text[l]} onChange={(e) => setText(l, e.target.value)} />)}
        </fieldset>

        <fieldset className="grid gap-2">
          <legend className="font-bold mb-1">🖼️ {t('image')}</legend>
          <div className="flex gap-2">
            <input className="input" dir="ltr" placeholder={t('imageUrl')} value={d.image} onChange={(e) => set({ image: e.target.value })} />
            <label className="btn-soft shrink-0 cursor-pointer">{t('upload')}<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => upload(e.target.files?.[0])} /></label>
          </div>
          {d.image && (d.type === 'map' ? <div className="map-shape h-32" style={{ ['--map' as any]: `url("${d.image}")` }} /> : <img src={d.image} alt="" className="max-h-40 w-fit rounded-xl" />)}
          <p className="text-xs muted">{t('copyrightNote')}</p>
        </fieldset>

        <fieldset className="grid gap-2">
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={choicesOn} disabled={forced !== null} onChange={(e) => setUseChoices(e.target.checked)} /> {t('useChoices')}</label>
          {choicesOn ? d.choices.map((c, i) => (
            <div key={i} className={cx('rounded-2xl border p-2 grid gap-1.5', d.correct === i ? 'border-ok/60 bg-ok/5' : 'border-white/10')}>
              <label className="flex items-center gap-2 text-sm font-bold"><input type="radio" name="correct" checked={d.correct === i} onChange={() => set({ correct: i })} /> {t('choice')} {i + 1} {d.correct === i && '✓'}</label>
              <div className="grid sm:grid-cols-3 gap-1.5">{LANGS.map((l) => <input key={l} className="input !py-2" dir={l === 'ar' ? 'rtl' : 'ltr'} placeholder={l.toUpperCase()} value={c[l]} onChange={(e) => setChoice(i, l, e.target.value)} />)}</div>
            </div>
          )) : (
            <div className="grid gap-2">
              <div className="text-xs muted">{t('acceptedAnswers')}</div>
              <div className="grid sm:grid-cols-3 gap-2">{LANGS.map((l) => <textarea key={l} className="input" rows={3} dir={l === 'ar' ? 'rtl' : 'ltr'} placeholder={l.toUpperCase()} value={answersText[l]} onChange={(e) => setAnswersText({ ...answersText, [l]: e.target.value })} />)}</div>
            </div>
          )}
        </fieldset>

        <fieldset className="grid sm:grid-cols-2 gap-3">
          <label className="label">{t('sourceTitle')}<input className="input" value={d.source.title} onChange={(e) => set({ source: { ...d.source, title: e.target.value } })} /></label>
          <label className="label">{t('sourceUrl')}<input className="input" dir="ltr" value={d.source.url} onChange={(e) => set({ source: { ...d.source, url: e.target.value } })} /></label>
          <label className="label">{t('factKey')}<input className="input" dir="ltr" value={d.factKey} onChange={(e) => set({ factKey: e.target.value })} /></label>
          <label className="label">{t('tags')}<input className="input" value={d.tags.join('|')} onChange={(e) => set({ tags: e.target.value.split('|') })} /></label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={d.volatile} onChange={(e) => set({ volatile: e.target.checked })} /> ⏳ {t('volatile')}</label>
          <label className="label">{t('verifiedAt')}<input className="input" type="date" value={d.verifiedAt} onChange={(e) => set({ verifiedAt: e.target.value })} /></label>
          <label className="label sm:col-span-2">{t('notes')}<textarea className="input" rows={2} value={d.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
        </fieldset>

        {(errors.length > 0 || warnings.length > 0) && (
          <div className="rounded-2xl bg-black/30 p-3 text-sm grid gap-1">
            {errors.map((e) => <div key={e} className="text-bad">⛔ {e}</div>)}
            {warnings.map((w) => <div key={w} className="text-gold">⚠️ {w}</div>)}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function ImportExport({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const [content, setContent] = useState('');
  const [format, setFormat] = useState<'auto' | 'json' | 'csv'>('auto');
  const [status, setStatus] = useState('review');
  const [overwrite, setOverwrite] = useState(false);
  const [result, setResult] = useState('');
  const run = async () => {
    const fmt = format === 'auto' ? (/^\s*[[{]/.test(content) ? 'json' : 'csv') : format;
    try {
      const r = await post('/api/questions/import', { format: fmt, content, status, overwrite });
      setResult(`✅ +${r.imported} · ↻ ${r.updated} · ⛔ ${r.skipped.length}\n` + r.skipped.map((s: any) => `#${s.row} ${s.id}: ${s.errors.join(' | ')}`).join('\n'));
      onChanged();
    } catch (e: any) { setResult(`❌ ${e.message}`); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={t('importTitle')} icon="📥">
        <div className="grid gap-2">
          <input type="file" accept=".json,.csv,application/json,text/csv" className="text-sm" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) { setContent(await f.text()); setFormat(f.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json'); }
          }} />
          <textarea className="input font-mono text-xs" rows={8} dir="ltr" placeholder={t('pastePh')} value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={format} onChange={(e) => setFormat(e.target.value as any)}><option value="auto" className="bg-ink">auto</option><option value="json" className="bg-ink">JSON</option><option value="csv" className="bg-ink">CSV</option></select>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t('importStatus')}>
              <option value="review" className="bg-ink">{t('s_review')}</option><option value="draft" className="bg-ink">{t('s_draft')}</option><option value="published" className="bg-ink">{t('s_published')}</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> {t('overwrite')}</label>
          <button className="btn-primary" disabled={!content.trim()} onClick={run}>{t('importBtn')}</button>
          {result && <pre className="text-xs whitespace-pre-wrap bg-black/30 rounded-xl p-2 max-h-60 overflow-auto" dir="ltr">{result}</pre>}
        </div>
      </Section>
      <Section title={t('exportJson')} icon="📤">
        <div className="grid gap-2">
          <button className="btn-soft" onClick={() => download('/api/questions/export?format=json', 'live-quiz-questions.json')}>{t('exportJson')}</button>
          <button className="btn-soft" onClick={() => download('/api/questions/export?format=csv', 'live-quiz-questions.csv')}>{t('exportCsv')}</button>
          <button className="btn-soft" onClick={() => download('/api/questions/template.csv', 'questions-template.csv')}>{t('template')}</button>
          <p className="text-xs muted" dir="ltr">CSV: category, subcategory, region (arab|world|foreign), difficulty, type, text_ar/fr/en, choice1_ar … choice4_en, correct (1-4), answers_ar|fr|en (sep. "|"), image, source_title, source_url, fact_key, volatile, verified_at, tags, notes, status</p>
        </div>
      </Section>
    </div>
  );
}
