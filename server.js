require('dotenv').config();
const { server, ensureDeploymentAdmin } = require('./app');
const notifications = require('./server/notifications');

const PORT = process.env.PORT || 3001;

ensureDeploymentAdmin()
  .then(() => {
    notifications.startReminderScheduler();
    server.listen(PORT, () => {
      console.log(`API + realtime server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Server startup failed: ${error.message}`);
    process.exitCode = 1;
  });
