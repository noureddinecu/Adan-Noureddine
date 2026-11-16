/* =========================================================================
 * «صح أم خطأ» — app shell: splash, home, modals, back button, sound.
 * The broadcast screen and the game are in tf.js; the panel/connectors in live.js.
 * ========================================================================= */
(function (G) {
  'use strict';
  const $ = id => document.getElementById(id);
  const Sfx = G.Sfx;
  const VERSION = '2.4.0';
  const SKEY = 'sahkhata.app.v1';

  // Logo: a green ✓ and a red ✗ on two floors, a little player in the middle
  const LOGO = `<svg viewBox="0 0 120 120"><defs>
      <linearGradient id="tlb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#4C1D95"/></linearGradient>
      <linearGradient id="tlr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6B6B"/><stop offset="1" stop-color="#D62839"/></linearGradient>
      <linearGradient id="tlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ADE80"/><stop offset="1" stop-color="#16A34A"/></linearGradient></defs>
    <circle cx="60" cy="60" r="56" fill="url(#tlb)" stroke="#FFE27A" stroke-width="4"/>
    <path d="M14 84 L38 64 H58 L50 84 Z" fill="url(#tlr)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M106 84 L82 64 H62 L70 84 Z" fill="url(#tlg)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M28 33 l12 12 M40 33 l-12 12" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
    <path d="M78 40 l6 6 l12 -13" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="60" cy="46" r="9" fill="#FFE27A" stroke="#fff" stroke-width="2.5"/>
    <rect x="52" y="56" width="16" height="18" rx="6" fill="#FFE27A" stroke="#fff" stroke-width="2.5"/>
    <text x="60" y="104" text-anchor="middle" font-size="14" font-weight="900" fill="#fff" font-family="Cairo, sans-serif">؟</text></svg>`;

  let settings = { sound: true };
  try { settings = Object.assign(settings, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (e) { /* */ }
  const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* */ } };

  const SOUND_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="#FFD23A"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  const SOUND_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" fill="#999"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
  const HELP = '<svg viewBox="0 0 24 24" fill="none" stroke="#2E2A30" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9.2" fill="#7DD0F2"/><path d="M9.3 9.4a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.8v.6"/></svg>';
  const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="#2E2A30" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';

  let screen = 'splash', modal = null;
  function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id)); screen = id; }
  function openModal(id) { closeModal(); modal = id; $(id).classList.add('active'); }
  function closeModal() { if (modal) $(modal).classList.remove('active'); modal = null; }
  function refreshSound() { const b = $('hSound'); if (b) { b.innerHTML = settings.sound ? SOUND_ON : SOUND_OFF; b.classList.toggle('off', !settings.sound); } }
  function toggleSound() { settings.sound = !settings.sound; saveSettings(); Sfx.setEnabled(settings.sound); if (settings.sound) Sfx.click(); refreshSound(); }
  function goMenu() { closeModal(); refreshSound(); show('home'); if (G.homeMusic) G.homeMusic(true); }

  let confirmCb = null;
  function confirmBox(title, text, cb) { $('cfTitle').textContent = title; $('cfText').textContent = text; confirmCb = cb; $('cfNo').style.display = ''; $('cfYes').textContent = 'نعم'; $('cfYes').className = 'btn danger'; openModal('confirm'); }
  function alertBox(title, text) { confirmBox(title, text, null); $('cfNo').style.display = 'none'; $('cfYes').textContent = 'حسناً'; $('cfYes').className = 'btn primary'; }

  G.haptic = () => { };
  G.onAndroidBack = function () {
    Sfx.back();
    if (modal) { closeModal(); return true; }
    if (G.Live && G.Live.active) return G.Live.onBack();
    if (screen === 'control') { goMenu(); return true; }
    return false;
  };
  G.onAppPause = function () { if (G.Live && G.Live.active) { G.Live.onAppPause(); return; } Sfx.suspend(); };
  G.onAppResume = function () { Sfx.resume(); };
  G.isLiveActive = function () { return !!(G.Live && G.Live.active); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) G.onAppPause(); else G.onAppResume(); });

  // the panel expects a "game" object (the old train game); the yes/no game has no canvas
  const game = { hidden: true, fpsCap: 0, pause() { }, mode: 'none' };

  function bind(id, fn, snd) { const el = $(id); if (el) el.addEventListener('click', e => { Sfx.unlock(); if (snd !== false) Sfx.click(); fn(e); }); }
  function boot() {
    Sfx.setEnabled(settings.sound);
    const logo = sfx => LOGO.replace(/tl([brg])"/g, 'tl$1' + sfx + '"').replace(/url\(#tl([brg])\)/g, 'url(#tl$1' + sfx + ')');
    $('splashLogo').innerHTML = logo('s'); $('homeLogo').innerHTML = logo('h');
    $('homeVer').textContent = 'v' + VERSION;
    document.querySelectorAll('.ico[data-i="help"]').forEach(e => { e.innerHTML = HELP; });
    document.querySelectorAll('.ico[data-i="back"]').forEach(e => { e.innerHTML = BACK; });
    G.Live.init({ game, Sfx, show, screen: () => screen, goMenu, openModal, alert: alertBox, confirm: confirmBox, toggleSound, soundOn: () => settings.sound });
    bind('hLive', () => G.Live.openPanel('quiz'));
    bind('hDemo', () => G.Live.quickDemo());
    bind('hGuide', () => openModal('liveGuide'));
    bind('guideOk', closeModal);
    bind('hSound', toggleSound, false);
    bind('hTestSound', () => { G.testSound && G.testSound(); G.Quiz && setTimeout(() => G.Quiz._debug().Voice.speak('مرحبا بكم في صح أم خطأ! اكتبوا العب في التعليقات باش تدخلو معانا!', true), 300); }, false);
    bind('cfYes', () => { const cb = confirmCb; closeModal(); cb && cb(); });
    bind('cfNo', closeModal);
    window.addEventListener('pointerdown', () => { Sfx.unlock(); if (screen === 'home' && G.Music && !G.Music.playing && G.homeMusic) G.homeMusic(true); });
    const fontsReady = document.fonts && document.fonts.load ? document.fonts.load('900 20px Cairo', 'صح أم خطأ').catch(() => 0) : Promise.resolve();
    Promise.all([fontsReady, new Promise(r => setTimeout(r, 1400))]).then(goMenu);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
