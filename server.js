require('dotenv').config();
const monitoring = require('./server/monitoring');
const { logger } = require('./server/logger');

process.on('unhandledRejection', (reason) => {
  const error = reason instanceof Error ? reason : new Error('Unhandled rejection', { cause: reason });
  logger.fatal({ err: error }, 'Unhandled rejection');
  monitoring.captureError(error);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  monitoring.captureError(error);
  monitoring.flush().catch(() => {}).finally(() => process.exit(1));
});

const { server, ensureDeploymentAdmin } = require('./app');
const notifications = require('./server/notifications');

const PORT = process.env.PORT || 3001;

ensureDeploymentAdmin()
  .then(() => {
    notifications.startReminderScheduler();
    server.listen(PORT, () => {
      logger.info(`API + realtime server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    logger.error({ err: error }, `Server startup failed: ${error.message}`);
    process.exitCode = 1;
  });
