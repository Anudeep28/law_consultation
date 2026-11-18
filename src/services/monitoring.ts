import * as Sentry from '@sentry/react';
import { ErrorInfo } from 'react';

export const initializeMonitoring = () => {
  if (!process.env.REACT_APP_SENTRY_DSN) return;
  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN,
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.user;
      delete event.breadcrumbs;
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
        delete event.request.cookies;
        delete event.request.query_string;
        if (event.request.url) event.request.url = event.request.url.split('?')[0];
      }
      return event;
    },
  });
};

export const reportBoundaryError = (error: Error, info: ErrorInfo) => {
  if (!process.env.REACT_APP_SENTRY_DSN) return;
  Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack } } });
};
