// نقطة تشغيل الخادم — Server entry point.
import { loadConfig } from './config.js';
import { createApp, networkUrls } from './app.js';

const config = loadConfig();
const app = createApp(config);

// Reconnect the comment provider that was active before a restart (TikTok reconnects automatically).
const prev = app.settings.get().provider;
if (prev.type === 'tiktok' && prev.username) app.hub.connect('tiktok', { username: prev.username }).catch(() => {});
else if (prev.type === 'demo' || prev.type === 'manual' || prev.type === 'webhook') app.hub.connect(prev.type).catch(() => {});

app.server.listen(config.port, config.host, () => {
  const urls = [`http://localhost:${config.port}`, ...networkUrls(config.port)];
  console.log('\n🎮 LIVE QUIZ GAME');
  console.log(`   ${app.store.all().length} سؤال في البنك (+${app.store.seedResult.added} جديد من ملفات البذور)`);
  console.log('   لوحة التحكم (افتحها من الهاتف على نفس الشبكة):');
  for (const u of urls) console.log(`     ${u}`);
  console.log(`   شاشة البث (Overlay):  ${urls[urls.length - 1]}/overlay`);
  if (app.auth.setupCode) console.log(`\n   🔑 رمز الإعداد الأول (لإنشاء كلمة مرور لوحة التحكم): ${app.auth.setupCode}\n`);
  else console.log('');
});

const shutdown = () => { try { app.engine.persist(); app.close(); } finally { process.exit(0); } };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (e) => console.error('uncaught', e)); // keep the game running
process.on('unhandledRejection', (e) => console.error('unhandled', e));
