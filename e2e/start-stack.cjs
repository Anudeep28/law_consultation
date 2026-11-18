const http = require('http');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const { backendEnv, fingerprint } = require('./runtime.cjs');

let backend;
let ready = false;
const checkReadiness = () => {
  if (backend.exitCode !== null || backend.killed) return;
  const retry = () => setTimeout(checkReadiness, 200).unref();
  const probe = http.get('http://127.0.0.1:3002/api/health', (res) => {
    res.resume();
    if (res.statusCode === 200) ready = true;
    else retry();
  });
  probe.setTimeout(1000, () => probe.destroy());
  probe.on('error', retry);
};
const stub = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'GET' && req.url === `/ready/${fingerprint}`) {
    res.writeHead(ready ? 200 : 503);
    return res.end(JSON.stringify({ ready }));
  }
  if (req.method !== 'POST' || req.url !== '/v1/orders') {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'Unknown stub endpoint' }));
  }
  try {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const { amount, currency } = JSON.parse(raw);
    if (!Number.isInteger(amount) || amount <= 0 || currency !== 'INR') throw new Error('Invalid order');
    res.end(JSON.stringify({ id: `order_e2e_${randomUUID()}`, amount, currency }));
  } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: { description: 'Invalid stub order' } }));
  }
});

stub.on('error', (error) => { console.error(error); process.exit(1); });
stub.listen(3901, '127.0.0.1', () => {
  backend = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, ...backendEnv },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  backend.stdout.on('data', (chunk) => {
    process.stdout.write(chunk);
  });
  backend.on('error', (error) => { console.error(error); stub.close(); process.exitCode = 1; });
  backend.on('exit', (code) => {
    ready = false;
    stub.close();
    process.exitCode = code || 0;
  });
  checkReadiness();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    ready = false;
    stub.close();
    if (backend) backend.kill(signal);
  });
}
