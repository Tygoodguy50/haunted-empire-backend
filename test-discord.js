// Test Discord notification delivery and log result
require('dotenv').config();
const { enqueueJob } = require('./billing/jobs');

(async () => {
  await enqueueJob('notify', { userId: 'testuser', type: 'test_notification' });
  // Wait a moment for async job to complete and log
  setTimeout(() => {
    console.log('Test complete. Check logs above for Discord webhook delivery result.');
    process.exit(0);
  }, 3000);
})();
