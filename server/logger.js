const crypto = require('crypto');
const pino = require('pino');
const pinoHttp = require('pino-http');
const monitoring = require('./monitoring');

const sensitiveField = /authorization|cookie|password|token|signature|otp|secret/i;
const requestIdPattern = /^[A-Za-z0-9_.:-]{1,128}$/;

const scrub = (value, seen = new WeakSet(), depth = 0) => {
  if (!value || typeof value !== 'object') return value;
  if (depth > 12) return '[Truncated]';
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (value instanceof Error) {
    const hasBody = 'body' in value;
    value = pino.stdSerializers.err(value);
    if (hasBody) value = { ...value, body: '[Redacted]', message: 'Invalid request body', stack: '[Redacted]' };
  }
  const result = Array.isArray(value) ? [] : Object.create(null);
  for (const [key, child] of Object.entries(value)) {
    result[key] = sensitiveField.test(key) ? '[Redacted]' : scrub(child, seen, depth + 1);
  }
  return result;
};

const serializeRequest = (req) => ({
  id: req.id,
  method: req.method,
  url: req.url?.split('?')[0],
  headers: scrub(req.headers),
});

const formatContext = (object) => {
  const { req, res, ...fields } = object;
  return {
    ...scrub(fields),
    ...(req ? { req: serializeRequest(req) } : {}),
    ...(res ? { res: { statusCode: res.statusCode } } : {}),
  };
};

const createLogger = (options = {}, destination) => {
  const instance = pino({
    level: process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID ? 'silent' : process.env.LOG_LEVEL || 'info',
    ...options,
    formatters: { log: formatContext, bindings: formatContext },
  }, destination);
  const child = instance.child;
  instance.child = function (bindings, childOptions) {
    return child.call(this, formatContext(bindings), childOptions);
  };
  return instance;
};

const logger = createLogger();

const createRequestLogging = (requestLogger = logger) => pinoHttp({
  logger: requestLogger,
  wrapSerializers: false,
  customProps: (req) => ({ requestId: req.id }),
  genReqId(req, res) {
    const incoming = req.headers['x-request-id'];
    const id = typeof incoming === 'string' && requestIdPattern.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  serializers: { req: serializeRequest, res: (res) => ({ statusCode: res.statusCode }) },
});

const errorHandler = (err, req, res, next) => {
  (req.log || logger).error({ err, requestId: req.id }, 'Unhandled request error:');
  monitoring.captureError(err, req.id);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error', requestId: req.id });
};

module.exports = { logger, createLogger, createRequestLogging, errorHandler };
