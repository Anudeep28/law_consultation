const http = require('http');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const { backendEnv, fingerprint, apiUrl, stubUrl } = require('./runtime.cjs');

let backend;
let ready = false;
const orders = new Map();
const refunds = new Map();
const checkReadiness = () => {
  if (backend.exitCode !== null || backend.killed) return;
  const retry = () => setTimeout(checkReadiness, 200).unref();
  const probe = http.get(`${apiUrl}/api/health`, (res) => {
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
  if (req.method === 'GET' && req.url.startsWith('/v1/refunds/')) {
    const refund = [...refunds.values()].find(item => item.id === req.url.slice('/v1/refunds/'.length));
    res.writeHead(refund ? 200 : 404);
    return res.end(JSON.stringify(refund || { error: 'Unknown refund' }));
  }
  if (req.method === 'GET' && /^\/v1\/payments\/[^/]+\/refunds\?/.test(req.url)) {
    const refund = refunds.get(req.url.split('/')[3]);
    const skip = Number(new URL(req.url, 'http://localhost').searchParams.get('skip'));
    return res.end(JSON.stringify({ items: refund && skip === 0 ? [refund] : [] }));
  }
  if (req.method === 'GET' && req.url.startsWith('/v1/payments/pay_e2e_')) {
    const paymentId = req.url.slice('/v1/payments/'.length);
    const orderId = paymentId.slice('pay_e2e_'.length);
    const order = orders.get(orderId);
    res.writeHead(order ? 200 : 404);
    return res.end(JSON.stringify(order ? { id: paymentId, order_id: orderId, amount: order.amount, currency: order.currency, status: 'captured', amount_refunded: refunds.get(paymentId)?.amount || 0 } : { error: { description: 'Unknown stub payment' } }));
  }
  if (req.method === 'POST' && /^\/v1\/payments\/pay_e2e_[a-zA-Z0-9_-]+\/refund$/.test(req.url)) {
    const paymentId = req.url.split('/')[3];
    const order = orders.get(paymentId.slice('pay_e2e_'.length));
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (!order || body.amount !== order.amount || refunds.has(paymentId)) {
      res.writeHead(400);
      return res.end(JSON.stringify({ error: { description: 'Invalid or duplicate stub refund' } }));
    }
    const refund = { id: `rfnd_e2e_${randomUUID()}`, payment_id: paymentId, amount: body.amount, currency: order.currency, status: 'processed', notes: body.notes };
    refunds.set(paymentId, refund);
    return res.end(JSON.stringify(refund));
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
    const order = { id: `order_e2e_${randomUUID()}`, amount, currency };
    orders.set(order.id, order);
    res.end(JSON.stringify(order));
  } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: { description: 'Invalid stub order' } }));
  }
});

stub.on('error', (error) => { console.error(error); process.exit(1); });
stub.listen(Number(new URL(stubUrl).port), '127.0.0.1', () => {
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
