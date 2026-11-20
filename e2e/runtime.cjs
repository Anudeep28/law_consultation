const crypto = require('crypto');
const path = require('path');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('Payment E2E requires DATABASE_URL pointing to a dedicated local database (for example law_writer_e2e).');
const database = new URL(databaseUrl);
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) || !database.pathname.endsWith('_e2e')) {
  throw new Error('Payment E2E refuses non-local databases or database names not ending in _e2e.');
}

const secret = 'law-writer-e2e-razorpay-secret';
const fingerprint = crypto.createHash('sha256').update(`${databaseUrl}|${secret}`).digest('hex');
const apiPort = process.env.E2E_API_PORT || '3002';
const apiUrl = `http://localhost:${apiPort}`;
const webUrl = `http://localhost:${process.env.E2E_WEB_PORT || '3000'}`;
const stubUrl = `http://127.0.0.1:${process.env.E2E_STUB_PORT || '3901'}`;

module.exports = {
  databaseUrl,
  secret,
  fingerprint,
  apiUrl, webUrl, stubUrl,
  fixturesPath: path.join(__dirname, '.auth', 'fixtures.json'),
  backendEnv: {
    PORT: apiPort, DATABASE_URL: databaseUrl, NODE_ENV: 'test',
    JWT_SECRET: 'law-writer-e2e-jwt-secret',
    RAZORPAY_ENV: 'test', RAZORPAY_KEY_ID: 'rzp_test_e2e', RAZORPAY_KEY_SECRET: secret,
    RAZORPAY_WEBHOOK_SECRET: 'law-writer-e2e-webhook-secret',
    RAZORPAY_API_URL: stubUrl,
    ADMIN_EMAIL: '', ADMIN_PASSWORD: '', RESEND_API_KEY: '', VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '',
  },
};
