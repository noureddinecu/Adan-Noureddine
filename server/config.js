// إعدادات التشغيل من متغيرات البيئة — Runtime configuration from environment variables.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'storage'));
  return {
    port: Number(env.PORT || 3000),
    host: env.HOST || '0.0.0.0', // reachable from the phone on the same Wi-Fi
    dataDir,
    dbFile: env.DB_FILE || path.join(dataDir, 'live-quiz.db'),
    uploadsDir: path.join(dataDir, 'uploads'),
    seedDir: path.join(ROOT, 'data'),
    distDir: path.join(ROOT, 'dist'),
    adminPassword: env.ADMIN_PASSWORD || '',
    tiktokSignApiKey: env.TIKTOK_SIGN_API_KEY || env.EULER_API_KEY || '',
    volatileMaxAgeDays: Number(env.VOLATILE_MAX_AGE_DAYS || 180),
    trustProxy: env.TRUST_PROXY === '1' || !!env.RENDER || !!env.RAILWAY_ENVIRONMENT || !!env.FLY_APP_NAME,
  };
}
