'use strict';

/** Deterministic env for every test file (runs before any module is loaded). */
const base = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/?replicaSet=rs0';
const dbName = `esg_test_${process.env.JEST_WORKER_ID || 1}`;
const url = new URL(base);
url.pathname = `/${dbName}`;

Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  MONGODB_URI: url.toString(),
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef0123456789abcdef',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef0123456789abcdef',
  CLIENT_URL: 'http://localhost:5173',
  STORAGE_DRIVER: 'local',
  UPLOAD_DIR: './tests/.uploads',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'ESG Test <no-reply@esg.test>',
  BCRYPT_COST: '4',
  PLATFORM_ADMIN_EMAILS: 'platform@esg.test',
});

