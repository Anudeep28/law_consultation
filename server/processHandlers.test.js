jest.mock('../app', () => ({ server: { listen: jest.fn() }, ensureDeploymentAdmin: jest.fn().mockResolvedValue(undefined) }));
jest.mock('./notifications', () => ({ startReminderScheduler: jest.fn() }));
jest.mock('./logger', () => ({ logger: { fatal: jest.fn(), info: jest.fn(), error: jest.fn() } }));
jest.mock('./monitoring', () => ({ captureError: jest.fn(), flush: jest.fn().mockResolvedValue(true) }));

const { logger } = require('./logger');
const monitoring = require('./monitoring');
let handlers;

beforeEach(async () => {
  jest.clearAllMocks();
  handlers = {};
  jest.spyOn(process, 'on').mockImplementation((event, callback) => { handlers[event] = callback; return process; });
  jest.spyOn(process, 'exit').mockImplementation(() => {});
  jest.isolateModules(() => require('../server'));
  await Promise.resolve();
});
afterEach(() => jest.restoreAllMocks());

test('unhandled rejection is fatal-logged and captured without forcing exit', () => {
  const error = new Error('Rejected task');
  handlers.unhandledRejection(error);
  expect(logger.fatal).toHaveBeenCalledWith({ err: error }, 'Unhandled rejection');
  expect(monitoring.captureError).toHaveBeenCalledWith(error);
  expect(process.exit).not.toHaveBeenCalled();
});

test('uncaught exception is fatal-logged, captured and exits after monitoring flush', async () => {
  const error = new Error('Uncaught task');
  handlers.uncaughtException(error);
  await Promise.resolve();
  await Promise.resolve();
  expect(logger.fatal).toHaveBeenCalledWith({ err: error }, 'Uncaught exception');
  expect(monitoring.captureError).toHaveBeenCalledWith(error);
  expect(monitoring.flush).toHaveBeenCalled();
  expect(process.exit).toHaveBeenCalledWith(1);
});
