process.env.JWT_SECRET = 'socket-privacy-secret';
jest.mock('../db', () => ({
  user: { findUnique: jest.fn(), update: jest.fn() },
  consultation: { findFirst: jest.fn(), findUnique: jest.fn() },
  consultationMessage: { create: jest.fn() },
  adminAuditLog: { create: jest.fn() },
  $transaction: jest.fn(),
}));
jest.mock('./notifications', () => ({ setSocketIo: jest.fn(), createNotification: jest.fn() }));

const { io: connect } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const prisma = require('../db');
const { app, server, io } = require('../app');
let address;
let clients = [];
let participant;
const admin = { id: 'admin', role: 'ADMIN', accountStatus: 'ACTIVE' };
const tokenFor = (id, options) => jwt.sign({ userId: id }, process.env.JWT_SECRET, options);
const openSocket = async (token = tokenFor('client')) => {
  const socket = connect(address, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  clients.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
};
const emit = (socket, event, payload) => socket.timeout(1000).emitWithAck(event, payload);

beforeAll(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  address = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await new Promise((resolve) => io.close(resolve)); });
beforeEach(() => {
  jest.clearAllMocks();
  participant = { id: 'client', role: 'CLIENT', accountStatus: 'ACTIVE' };
  prisma.user.findUnique.mockImplementation(async ({ where }) => where.id === admin.id ? admin : participant);
  prisma.consultation.findFirst.mockResolvedValue({ id: 'consultation' });
  prisma.consultationMessage.create.mockResolvedValue({ id: 'message', consultationId: 'consultation', sender: 'USER', content: 'Hello' });
  prisma.consultation.findUnique.mockResolvedValue(null);
  prisma.$transaction.mockImplementation((callback) => callback(prisma));
  prisma.user.update.mockImplementation(async ({ data }) => ({ ...participant, ...data }));
});
afterEach(() => { clients.forEach((socket) => socket.close()); clients = []; jest.restoreAllMocks(); });

test.each(['SUSPENDED', 'DEACTIVATED'])('admin %s disconnects existing user sockets', async (status) => {
  const socket = await openSocket();
  const disconnected = new Promise((resolve) => socket.once('disconnect', resolve));
  const response = await request(app).patch('/api/admin/users/client/status')
    .set('Authorization', `Bearer ${tokenFor('admin')}`).send({ status, reason: 'Privacy regression test' });
  expect(response.status).toBe(200);
  expect(socket.connected).toBe(false);
  await disconnected;
});

test('setting ACTIVE does not disconnect the user', async () => {
  const socket = await openSocket();
  expect((await request(app).patch('/api/admin/users/client/status')
    .set('Authorization', `Bearer ${tokenFor('admin')}`).send({ status: 'ACTIVE' })).status).toBe(200);
  expect(socket.connected).toBe(true);
});

test.each(['chat:join', 'chat:message'])('%s rechecks account status after the handshake', async (event) => {
  const socket = await openSocket();
  participant = { ...participant, accountStatus: 'SUSPENDED' };
  const response = await emit(socket, event, { consultationId: 'consultation', content: 'Hello' });
  expect(response.error).toBeTruthy();
  expect(prisma.consultation.findFirst).not.toHaveBeenCalled();
  expect(prisma.consultationMessage.create).not.toHaveBeenCalled();
});

test.each(['chat:join', 'chat:message'])('%s rechecks JWT expiry after the handshake', async (event) => {
  const now = Date.now();
  const socket = await openSocket(tokenFor('client', { expiresIn: 60 }));
  const verify = jwt.verify;
  jest.spyOn(jwt, 'verify').mockImplementation((token, secret) => verify(token, secret, { clockTimestamp: Math.floor(now / 1000) + 120 }));
  const response = await emit(socket, event, { consultationId: 'consultation', content: 'Hello' });
  expect(response.error).toBeTruthy();
  expect(prisma.consultation.findFirst).not.toHaveBeenCalled();
});

test('active participants can join and send while non-participants are rejected', async () => {
  const socket = await openSocket();
  expect(await emit(socket, 'chat:join', { consultationId: 'consultation' })).toEqual({ ok: true });
  expect(await emit(socket, 'chat:message', { consultationId: 'consultation', content: 'Hello' })).toEqual({ ok: true });
  expect(prisma.consultation.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'client', mode: 'CHAT', status: 'BOOKED', startsAt: expect.any(Object), endsAt: expect.any(Object) }) }));
  prisma.consultation.findFirst.mockResolvedValue(null);
  expect((await emit(socket, 'chat:join', { consultationId: 'other' })).error).toBeTruthy();
});

test('a deleted user is rejected by events on an existing connection', async () => {
  const socket = await openSocket();
  participant = null;
  expect((await emit(socket, 'chat:join', { consultationId: 'consultation' })).error).toBeTruthy();
});
