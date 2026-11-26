let sentry;

if (process.env.SENTRY_DSN) {
  sentry = require('@sentry/node');
  sentry.init({
    dsn: process.env.SENTRY_DSN,
    sendDefaultPii: false,
    integrations: (integrations) => integrations.filter((integration) => !['OnUncaughtException', 'OnUnhandledRejection'].includes(integration.name)),
    beforeSend(event, hint) {
      delete event.user;
      delete event.breadcrumbs;
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.query_string;
        if (event.request.url) event.request.url = event.request.url.split('?')[0];
      }
      if (hint.originalException && typeof hint.originalException === 'object' && 'body' in hint.originalException) {
        for (const exception of event.exception?.values || []) exception.value = 'Invalid request body';
      }
      return event;
    },
  });
}

const captureError = (error, requestId) => {
  if (sentry) sentry.captureException(error, requestId ? { tags: { requestId } } : undefined);
};

const flush = () => sentry ? sentry.flush(2000) : Promise.resolve(true);

const sentryIngestOrigins = () => {
  const origins = [];
  for (const dsn of [process.env.SENTRY_DSN, process.env.REACT_APP_SENTRY_DSN]) {
    if (!dsn) continue;
    try {
      const url = new URL(dsn);
      if (url.protocol === 'https:' || url.protocol === 'http:') origins.push(url.origin);
    } catch {
      // Invalid DSNs must not broaden the CSP.
    }
  }
  return [...new Set(origins)];
};

module.exports = { captureError, flush, sentryIngestOrigins };
