import { useSyncExternalStore } from 'react';
import type { T3 } from './types';

const ar = {
  appTagline: 'منصة المسابقات المباشرة',
  live: 'المباشر', questions: 'الأسئلة', players: 'اللاعبون', history: 'السجل', settings: 'الإعدادات',
  login: 'دخول', password: 'كلمة المرور', loginTitle: 'لوحة تحكم المسابقة', loginHint: 'أدخل كلمة مرور لوحة التحكم.',
  setupTitle: 'إعداد أول مرة', setupHint: 'أنشئ كلمة مرور للوحة التحكم. رمز الإعداد المكوّن من 6 أرقام يظهر في سجل الخادم عند التشغيل.',
  setupCode: 'رمز الإعداد', newPassword: 'كلمة مرور جديدة (6 أحرف على الأقل)', create: 'إنشاء', logout: 'تسجيل الخروج',
  offline: 'غير متصل بالخادم — إعادة المحاولة…',
  // phases
  ph_idle: 'في الانتظار', ph_countdown: 'العد التنازلي', ph_question: 'السؤال مفتوح', ph_reveal: 'كشف الجواب', ph_finished: 'انتهت المسابقة', paused: 'متوقف مؤقتاً',
  // controls
  start: 'بدء المسابقة', newGame: 'مسابقة جديدة', stop: 'إنهاء', next: 'التالي', reveal: 'كشف الجواب', pause: 'إيقاف مؤقت', resume: 'استئناف', restart: 'إعادة الجولة',
  confirmStop: 'إنهاء المسابقة الآن وإعلان الفائز؟', confirmRestart: 'إعادة الجولة من السؤال الأول؟ سيتم إلغاء نقاط هذه الجولة.',
  questionN: 'سؤال', of: 'من', attempts: 'محاولات', hostAnswer: 'الجواب (يظهر لك فقط)', showAnswer: 'إظهار الجواب', hideAnswer: 'إخفاء',
  seats: 'أول الفائزين', waiting: 'بانتظار إجابة صحيحة…', noQuestion: 'لا يوجد سؤال حالياً — ابدأ مسابقة.',
  // provider
  connection: 'استقبال التعليقات', provider_tiktok: 'TikTok', provider_demo: 'عرض تجريبي', provider_manual: 'يدوي', provider_webhook: 'Webhook',
  connect: 'اتصال', disconnect: 'قطع', usernamePh: 'اسم حساب TikTok بدون @', noPassword: 'لا نطلب كلمة مرور TikTok أبداً — يكفي اسم الحساب الذي يبث الآن.',
  st_idle: 'غير متصل', st_connecting: 'جارٍ الاتصال…', st_connected: 'متصل', st_reconnecting: 'إعادة الاتصال…', st_error: 'فشل الاتصال', st_ended: 'انتهى البث',
  viewers: 'مشاهد', received: 'تعليق مستلم', retryIn: 'إعادة المحاولة خلال', demoNote: 'يُنشئ مشاهدين آليين 🤖 لتجربة اللعبة. نتائجهم معلّمة كتجريبية ويمكن حذفها.',
  manualNote: 'اقرأ التعليقات من تطبيق TikTok وأدخل اسم المشارك وجوابه، أو اضغط ✓ لاحتسابه صحيحاً.',
  webhookNote: 'أرسل التعليقات من أي أداة خارجية (POST JSON) إلى الرابط التالي مع المفتاح.',
  tiktokNote: 'اتصال عبر مكتبة غير رسمية (tiktok-live-connector) وخادم توقيع خارجي. قد يتوقف إذا غيّرت TikTok نظامها.',
  // round setup
  roundSetup: 'إعداد الجولة', randomMode: 'وضع عشوائي (كل التصنيفات)', categories: 'التصنيفات', difficulty: 'الصعوبة', types: 'أنواع الأسئلة', count: 'عدد الأسئلة',
  duration: 'مدة السؤال (ث)', available: 'متاح', willPlay: 'ستضم الجولة', arabRegion: 'عربي ومغربي', worldRegion: 'عالمي', foreignRegion: 'أجنبي متنوع',
  notEnough: 'عدد الأسئلة المتاحة أقل من المطلوب', all: 'الكل', subcats: 'التصنيفات الفرعية',
  easy: 'سهل', medium: 'متوسط', hard: 'صعب',
  // comments
  comments: 'التعليقات المباشرة', f_all: 'الكل', f_correct: 'صحيحة', f_wrong: 'خاطئة', noComments: 'لا توجد تعليقات بعد.',
  o_correct: 'صحيح', o_wrong: 'خطأ', o_ignored: 'دردشة', o_closed: 'خارج الوقت', o_paused: 'متوقف', 'o_one-attempt': 'محاولة ثانية', 'o_already-won': 'فاز مسبقاً',
  'o_seats-full': 'المقاعد مكتملة', o_throttled: 'سريع جداً', o_banned: 'محظور', o_invalid: 'غير صالح',
  manualEntry: 'إدخال يدوي', name: 'الاسم', answer: 'الجواب', send: 'إرسال', markCorrect: 'احتساب صحيح',
  leaderboard: 'الترتيب', thisGame: 'هذه المسابقة', allTime: 'الإجمالي', pts: 'نقطة', wins: 'فوز', correct: 'صحيحة', empty: 'لا يوجد بعد',
  screens: 'شاشات العرض', overlayLink: 'شاشة البث (شفافة)', screenLink: 'شاشة اللعبة (خلفية متحركة)', copy: 'نسخ', copied: 'تم النسخ', open: 'فتح',
  // questions
  bank: 'البنك', review: 'المراجعة', sportsFacts: 'معلومات متغيرة', importExport: 'استيراد/تصدير', search: 'بحث…', newQuestion: 'سؤال جديد',
  status: 'الحالة', s_published: 'منشور', s_review: 'قيد المراجعة', s_draft: 'مسودة', category: 'التصنيف', subcategory: 'التصنيف الفرعي', region: 'المنطقة الثقافية', type: 'النوع',
  edit: 'تعديل', delete: 'حذف', publish: 'نشر', toDraft: 'إلى المسودات', toReview: 'للمراجعة', verifyToday: 'تم التحقق اليوم', confirmDelete: 'حذف نهائياً؟',
  questionText: 'نص السؤال', image: 'الصورة', imageUrl: 'رابط الصورة أو /uploads/…', upload: 'رفع', useChoices: 'أربعة اختيارات (أ/ب/ج/د)', choice: 'الاختيار',
  acceptedAnswers: 'الأجوبة المقبولة (جواب في كل سطر — الأول هو الرسمي)', source: 'المصدر', sourceTitle: 'عنوان المصدر', sourceUrl: 'رابط المصدر', factKey: 'معرّف المعلومة (factKey)',
  volatile: 'معلومة رياضية متغيرة (تُحدَّث منفصلة)', verifiedAt: 'تاريخ آخر تحقق', notes: 'ملاحظات', tags: 'وسوم (مفصولة بـ |)', save: 'حفظ', saveDraft: 'حفظ كمسودة', sendReview: 'إرسال للمراجعة', savePublish: 'حفظ ونشر',
  cancel: 'إلغاء', close: 'إغلاق', errors: 'أخطاء', warnings: 'تنبيهات', saved: 'تم الحفظ', copyrightNote: 'استعمل صوراً تملك حق استعمالها (صور اللاعبين وشعارات الأندية محمية غالباً بحقوق النشر).',
  reviewEmpty: 'لا توجد أسئلة بانتظار المراجعة 🎉', staleEmpty: 'كل المعلومات المتغيرة محدثة ✅', staleNote: 'هذه الأسئلة محفوظة منفصلة وتُستبعد تلقائياً من اللعب إذا مر على آخر تحقق أكثر من 180 يوماً. راجع المصدر قبل الضغط على «تم التحقق».',
  importTitle: 'استيراد (JSON أو CSV)', importBtn: 'استيراد', pastePh: 'أو الصق المحتوى هنا', importStatus: 'الحالة بعد الاستيراد', overwrite: 'استبدال نفس المعرّف',
  exportJson: 'تصدير JSON', exportCsv: 'تصدير CSV', template: 'قالب CSV', loadMore: 'عرض المزيد', results: 'نتيجة',
  // players
  sort: 'ترتيب', sortPoints: 'النقاط', sortWins: 'مرات الفوز', sortRecent: 'آخر نشاط', resetScores: 'تصفير كل النقاط', confirmReset: 'تصفير نقاط جميع اللاعبين؟ (السجل يبقى محفوظاً)',
  removeDemo: 'حذف اللاعبين التجريبيين', adjust: 'تعديل النقاط', reason: 'السبب', apply: 'تطبيق', ban: 'حظر', unban: 'رفع الحظر', banned: 'محظور', demo: 'تجريبي',
  rank: 'الترتيب', attemptsN: 'محاولات', answersLog: 'سجل المشاركات', gamesPlayed: 'المسابقات', noPlayers: 'لا يوجد لاعبون بعد.',
  // history
  noGames: 'لم تُلعب أي مسابقة بعد.', champion: 'البطل', questionsPlayed: 'أسئلة', playersN: 'مشاركين', durationLbl: 'المدة', running: 'جارية',
  // settings
  scoring: 'النقاط والفائزون', winnersCount: 'عدد الفائزين في كل سؤال', place: 'المركز', quota: 'نسب الأسئلة', quotaNote: 'تُطبَّق عند اختيار أسئلة كل جولة.', total: 'المجموع',
  timing: 'التوقيت', revealTime: 'مدة عرض الجواب (ث)', startDelay: 'العد التنازلي قبل البداية (ث)', autoAdvance: 'انتقال تلقائي للسؤال التالي',
  display: 'العرض', overlayLang: 'لغة الأسئلة على الشاشة', hints: 'عرض الحروف المخفية تدريجياً', showFeed: 'عرض تعليقات المشاركين', showLeaderboard: 'عرض الترتيب', shuffle: 'خلط ترتيب الاختيارات',
  effects: 'الصوت والمؤثرات', sound: 'المؤثرات الصوتية', volume: 'مستوى الصوت', confettiLbl: 'مؤثرات احتفالية', lowFx: 'وضع خفيف (أداء أفضل للبث)', phoneSound: 'تشغيل الأصوات على هذا الهاتف أيضاً',
  ev_question: 'بداية السؤال', ev_tick: 'العد التنازلي', ev_correct: 'إجابة صحيحة', ev_wrong: 'إجابة خاطئة', ev_first: 'المركز الأول', ev_win: 'إعلان الفائز',
  test: 'تجربة', custom: 'مخصص', reset: 'افتراضي', uiLang: 'لغة الواجهة', devices: 'الأجهزة والروابط', devicesNote: 'افتح هذا الرابط على أي جهاز في نفس الشبكة، أو امسح رمز QR.',
  security: 'الأمان', currentPassword: 'كلمة المرور الحالية', changePassword: 'تغيير كلمة المرور', webhookKey: 'مفتاح Webhook', regenerate: 'توليد مفتاح جديد',
  install: 'تثبيت التطبيق على الهاتف', installHint: 'على iPhone: زر المشاركة ← «إضافة إلى الشاشة الرئيسية». على Android: القائمة ← «تثبيت التطبيق».', credits: 'حقوق',
  ty_mcq: 'أربعة اختيارات', ty_open: 'إجابة مباشرة', ty_complete: 'أكمل العبارة', ty_country: 'خمّن الدولة', ty_capital: 'خمّن العاصمة', ty_flag: 'علم دولة', ty_map: 'خريطة دولة',
  ty_image_person: 'شخصية من صورة', ty_image_player: 'لاعب من صورته', ty_logo: 'شعار نادٍ', ty_landmark: 'معلم سياحي',
  appHome: 'شاشة التطبيق الرئيسية (تغيير الخادم / شاشة اللعبة)',
  savedAuto: 'يُحفظ تلقائياً', language: 'اللغة',
};
type Key = keyof typeof ar;
const en: Record<Key, string> = {
  appTagline: 'Live quiz platform',
  live: 'Live', questions: 'Questions', players: 'Players', history: 'History', settings: 'Settings',
  login: 'Sign in', password: 'Password', loginTitle: 'Quiz control panel', loginHint: 'Enter the dashboard password.',
  setupTitle: 'First-time setup', setupHint: 'Create a dashboard password. The 6-digit setup code is printed in the server log at startup.',
  setupCode: 'Setup code', newPassword: 'New password (min 6 characters)', create: 'Create', logout: 'Sign out',
  offline: 'Disconnected from server — retrying…',
  ph_idle: 'Waiting', ph_countdown: 'Countdown', ph_question: 'Question open', ph_reveal: 'Answer revealed', ph_finished: 'Game over', paused: 'Paused',
  start: 'Start game', newGame: 'New game', stop: 'Stop', next: 'Next', reveal: 'Reveal', pause: 'Pause', resume: 'Resume', restart: 'Restart round',
  confirmStop: 'End the game now and announce the winner?', confirmRestart: 'Restart from question 1? Points of this round will be removed.',
  questionN: 'Question', of: 'of', attempts: 'attempts', hostAnswer: 'Answer (only you see this)', showAnswer: 'Show answer', hideAnswer: 'Hide',
  seats: 'First winners', waiting: 'Waiting for a correct answer…', noQuestion: 'No question right now — start a game.',
  connection: 'Comment source', provider_tiktok: 'TikTok', provider_demo: 'Demo', provider_manual: 'Manual', provider_webhook: 'Webhook',
  connect: 'Connect', disconnect: 'Disconnect', usernamePh: 'TikTok username without @', noPassword: 'We never ask for your TikTok password — only the username that is LIVE.',
  st_idle: 'Not connected', st_connecting: 'Connecting…', st_connected: 'Connected', st_reconnecting: 'Reconnecting…', st_error: 'Connection failed', st_ended: 'Stream ended',
  viewers: 'viewers', received: 'comments received', retryIn: 'Retrying in', demoNote: 'Creates simulated 🤖 viewers to try the game. Their results are marked as demo and can be deleted.',
  manualNote: 'Read comments in the TikTok app and type the viewer name and answer, or tap ✓ to count it correct.',
  webhookNote: 'Send comments from any external tool (POST JSON) to this URL with the key.',
  tiktokNote: 'Uses an unofficial library (tiktok-live-connector) and an external sign server. It may break if TikTok changes its systems.',
  roundSetup: 'Round setup', randomMode: 'Random mode (all categories)', categories: 'Categories', difficulty: 'Difficulty', types: 'Question types', count: 'Questions',
  duration: 'Time per question (s)', available: 'available', willPlay: 'round will have', arabRegion: 'Arab & Moroccan', worldRegion: 'World', foreignRegion: 'Foreign misc',
  notEnough: 'Fewer questions available than requested', all: 'All', subcats: 'Subcategories',
  easy: 'Easy', medium: 'Medium', hard: 'Hard',
  comments: 'Live comments', f_all: 'All', f_correct: 'Correct', f_wrong: 'Wrong', noComments: 'No comments yet.',
  o_correct: 'Correct', o_wrong: 'Wrong', o_ignored: 'Chat', o_closed: 'Too late', o_paused: 'Paused', 'o_one-attempt': '2nd attempt', 'o_already-won': 'Already won',
  'o_seats-full': 'Seats full', o_throttled: 'Too fast', o_banned: 'Banned', o_invalid: 'Invalid',
  manualEntry: 'Manual entry', name: 'Name', answer: 'Answer', send: 'Send', markCorrect: 'Count correct',
  leaderboard: 'Leaderboard', thisGame: 'This game', allTime: 'All time', pts: 'pts', wins: 'wins', correct: 'correct', empty: 'Nothing yet',
  screens: 'Display screens', overlayLink: 'Stream overlay (transparent)', screenLink: 'Game screen (animated background)', copy: 'Copy', copied: 'Copied', open: 'Open',
  bank: 'Bank', review: 'Review', sportsFacts: 'Changing facts', importExport: 'Import/Export', search: 'Search…', newQuestion: 'New question',
  status: 'Status', s_published: 'Published', s_review: 'In review', s_draft: 'Draft', category: 'Category', subcategory: 'Subcategory', region: 'Cultural region', type: 'Type',
  edit: 'Edit', delete: 'Delete', publish: 'Publish', toDraft: 'To drafts', toReview: 'To review', verifyToday: 'Verified today', confirmDelete: 'Delete permanently?',
  questionText: 'Question text', image: 'Image', imageUrl: 'Image URL or /uploads/…', upload: 'Upload', useChoices: 'Four choices (A/B/C/D)', choice: 'Choice',
  acceptedAnswers: 'Accepted answers (one per line — first is official)', source: 'Source', sourceTitle: 'Source title', sourceUrl: 'Source URL', factKey: 'Fact key',
  volatile: 'Changing sports fact (updated separately)', verifiedAt: 'Last verified', notes: 'Notes', tags: 'Tags (separated by |)', save: 'Save', saveDraft: 'Save draft', sendReview: 'Send to review', savePublish: 'Save & publish',
  cancel: 'Cancel', close: 'Close', errors: 'Errors', warnings: 'Warnings', saved: 'Saved', copyrightNote: 'Use images you have the right to use (player photos and club crests are usually copyrighted).',
  reviewEmpty: 'Nothing waiting for review 🎉', staleEmpty: 'All changing facts are up to date ✅', staleNote: 'Stored separately and automatically excluded from play when last verified more than 180 days ago. Check the source before tapping "Verified".',
  importTitle: 'Import (JSON or CSV)', importBtn: 'Import', pastePh: 'or paste the content here', importStatus: 'Status after import', overwrite: 'Replace same id',
  exportJson: 'Export JSON', exportCsv: 'Export CSV', template: 'CSV template', loadMore: 'Show more', results: 'results',
  sort: 'Sort', sortPoints: 'Points', sortWins: 'Wins', sortRecent: 'Recent', resetScores: 'Reset all points', confirmReset: 'Reset the points of all players? (history is kept)',
  removeDemo: 'Remove demo players', adjust: 'Adjust points', reason: 'Reason', apply: 'Apply', ban: 'Ban', unban: 'Unban', banned: 'Banned', demo: 'Demo',
  rank: 'Rank', attemptsN: 'attempts', answersLog: 'Participation history', gamesPlayed: 'Games', noPlayers: 'No players yet.',
  noGames: 'No games played yet.', champion: 'Champion', questionsPlayed: 'questions', playersN: 'players', durationLbl: 'Duration', running: 'Running',
  scoring: 'Points & winners', winnersCount: 'Winners per question', place: 'Place', quota: 'Question mix', quotaNote: 'Applied when each round picks its questions.', total: 'Total',
  timing: 'Timing', revealTime: 'Answer display (s)', startDelay: 'Countdown before start (s)', autoAdvance: 'Auto-advance to next question',
  display: 'Display', overlayLang: 'On-screen question language', hints: 'Reveal hidden letters progressively', showFeed: 'Show participant comments', showLeaderboard: 'Show leaderboard', shuffle: 'Shuffle choices',
  effects: 'Sound & effects', sound: 'Sound effects', volume: 'Volume', confettiLbl: 'Celebration effects', lowFx: 'Light mode (better stream performance)', phoneSound: 'Also play sounds on this phone',
  ev_question: 'Question start', ev_tick: 'Countdown', ev_correct: 'Correct answer', ev_wrong: 'Wrong answer', ev_first: 'First place', ev_win: 'Winner announcement',
  test: 'Test', custom: 'Custom', reset: 'Default', uiLang: 'Interface language', devices: 'Devices & links', devicesNote: 'Open this link on any device on the same network, or scan the QR code.',
  security: 'Security', currentPassword: 'Current password', changePassword: 'Change password', webhookKey: 'Webhook key', regenerate: 'Generate new key',
  install: 'Install the app on your phone', installHint: 'iPhone: Share → "Add to Home Screen". Android: menu → "Install app".', credits: 'Credits',
  ty_mcq: 'Multiple choice', ty_open: 'Typed answer', ty_complete: 'Complete the phrase', ty_country: 'Guess the country', ty_capital: 'Guess the capital', ty_flag: 'Flag', ty_map: 'Map',
  ty_image_person: 'Person photo', ty_image_player: 'Player photo', ty_logo: 'Club crest', ty_landmark: 'Landmark',
  appHome: 'App home (change server / game screen)',
  savedAuto: 'Saved automatically', language: 'Language',
};

export type UiLang = 'ar' | 'en';
const DICTS: Record<UiLang, Record<Key, string>> = { ar, en };
const subs = new Set<() => void>();
let lang: UiLang = (() => { try { return (localStorage.getItem('lqg.lang') as UiLang) || 'ar'; } catch { return 'ar'; } })();

function apply() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}
apply();

export function setUiLang(l: UiLang) {
  lang = l;
  try { localStorage.setItem('lqg.lang', l); } catch { /* ignore */ }
  apply();
  subs.forEach((f) => f());
}

export function useI18n() {
  const l = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => lang);
  const t = (k: Key | string) => (DICTS[l] as Record<string, string>)[k] ?? (ar as Record<string, string>)[k] ?? k;
  const tr = (v: Partial<T3> | undefined) => (v ? v[l] || v.ar || v.en || v.fr || '' : '');
  return { lang: l, t, tr, dir: l === 'ar' ? 'rtl' : 'ltr' };
}

/** Overlay labels in the three content languages. */
export const OVERLAY: Record<'ar' | 'fr' | 'en', Record<string, string>> = {
  ar: {
    waiting: 'المسابقة تبدأ قريباً', waitingSub: 'جهّزوا أصابعكم للتعليق ⚡', ready: 'استعدوا!', question: 'سؤال', typeLetter: 'اكتب أ أو ب أو ج أو د في التعليقات',
    typeAnswer: 'اكتب الجواب في التعليقات 💬', firstN: 'أول {n} أجوبة صحيحة تفوز', answer: 'الجواب الصحيح', noWinner: 'لم يُجب أحد بشكل صحيح 😅', top: 'الأفضل',
    champion: 'بطل المسابقة', pts: 'نقطة', finished: 'انتهت المسابقة!', thanks: 'شكراً لكل المشاركين ❤️', paused: 'استراحة قصيرة ⏸', easy: 'سهل', medium: 'متوسط', hard: 'صعب',
    answered: 'أجاب ✓', tapSound: '🔊 اضغط لتفعيل الصوت', allTime: 'أفضل اللاعبين',
  },
  fr: {
    waiting: 'Le quiz commence bientôt', waitingSub: 'Préparez vos commentaires ⚡', ready: 'Prêts ?', question: 'Question', typeLetter: 'Écris A, B, C ou D dans les commentaires',
    typeAnswer: 'Écris la réponse dans les commentaires 💬', firstN: 'Les {n} premières bonnes réponses gagnent', answer: 'Bonne réponse', noWinner: 'Personne n’a trouvé 😅', top: 'Classement',
    champion: 'Champion du quiz', pts: 'pts', finished: 'Quiz terminé !', thanks: 'Merci à tous ❤️', paused: 'Petite pause ⏸', easy: 'Facile', medium: 'Moyen', hard: 'Difficile',
    answered: 'a trouvé ✓', tapSound: '🔊 Touchez pour activer le son', allTime: 'Meilleurs joueurs',
  },
  en: {
    waiting: 'Quiz starting soon', waitingSub: 'Get ready to comment ⚡', ready: 'Get ready!', question: 'Question', typeLetter: 'Type A, B, C or D in the comments',
    typeAnswer: 'Type the answer in the comments 💬', firstN: 'First {n} correct answers win', answer: 'Correct answer', noWinner: 'Nobody got it 😅', top: 'Leaderboard',
    champion: 'Quiz champion', pts: 'pts', finished: 'Game over!', thanks: 'Thanks for playing ❤️', paused: 'Short break ⏸', easy: 'Easy', medium: 'Medium', hard: 'Hard',
    answered: 'got it ✓', tapSound: '🔊 Tap to enable sound', allTime: 'Top players',
  },
};
