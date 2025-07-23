// Async job/retry logic for billing events
// Use for webhook retries, background processing, etc.


const { getCollection } = require('./db');

// Enqueue a job and persist to MongoDB
async function enqueueJob(type, payload) {
  const job = { type, payload, created: new Date(), status: 'pending' };
  const jobsCol = await getCollection('jobs');
  await jobsCol.insertOne(job);
  // Centralized logging
  console.log(`[Job] Enqueued: ${type}`, payload);
  // Process immediately (for demo); in production, use a worker
  processJob(job);
}

// Process a job (promotion, db_update, notify)
async function processJob(job) {
  if (!job) return;
  // Centralized logging
  console.log(`[Job] Processing: ${job.type}`, job.payload);
  switch (job.type) {
    case 'promotion': {
      // Integrate with ad system (example: HTTP POST to ad API)
      try {
        const res = await fetch('https://your-ad-api.com/promote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(job.payload),
        });
        console.log('[AdSystem] Promotion sent:', await res.json());
      } catch (err) {
        console.error('[AdSystem] Promotion error:', err);
      }
      await markJobComplete(job, 'done');
      break;
    }
    case 'db_update': {
      await handleDBUpdate(job.payload);
      await markJobComplete(job, 'done');
      break;
    }
    case 'notify': {
      // Discord webhook notification
      try {
        if (process.env.DISCORD_WEBHOOK_URL) {
          const content = job.payload.message || `User ${job.payload.userId} event: ${job.payload.type}`;
          const res = await fetch(process.env.DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          });
          if (res.ok) {
            console.log('[Notify] Discord webhook sent:', job.payload);
          } else {
            const errText = await res.text();
            console.error('[Notify] Discord webhook failed:', res.status, errText);
          }
        }
      } catch (err) {
        console.error('[Notify] Discord error:', err);
      }
      // Email notification (example: SendGrid)
      try {
        if (process.env.SENDGRID_API_KEY && job.payload.email) {
          await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: job.payload.email }] }],
              from: { email: 'noreply@hauntedempire.com' },
              subject: 'Payment Event',
              content: [{ type: 'text/plain', value: `Your event: ${job.payload.type}` }],
            }),
          });
        }
      } catch (err) {
        console.error('[Notify] Email error:', err);
      }
      console.log('[Notify] Notification job:', job.payload);
      await markJobComplete(job, 'done');
      break;
    }
    default:
      console.log('[Job] Unknown job type:', job.type);
      await markJobComplete(job, 'error');
  }
}

// Mark job as complete in DB
async function markJobComplete(job, status) {
  const jobsCol = await getCollection('jobs');
  await jobsCol.updateOne({ _id: job._id }, { $set: { status, completed: new Date() } });
  // Centralized logging
  console.log(`[Job] Completed: ${job.type} (${status})`, job.payload);
}

// Handle user/account DB updates
async function handleDBUpdate(payload) {
  const usersCol = await getCollection('users');
  if (!payload.userId) return;
  switch (payload.action) {
    case 'upgrade': {
      await usersCol.updateOne(
        { userId: payload.userId },
        { $set: { tier: 'premium', lastPayment: payload.paymentId, lastAmount: payload.amount } },
        { upsert: true }
      );
      console.log('[DB] Upgraded user:', payload.userId);
      // Automated Discord notification for upgrade
      if (payload.notify) {
        await module.exports.enqueueJob('notify', {
          userId: payload.userId,
          type: 'upgrade',
          paymentId: payload.paymentId,
          amount: payload.amount,
          message: `User ${payload.userId} upgraded to premium.`
        });
      }
      break;
    }
    case 'downgrade': {
      await usersCol.updateOne(
        { userId: payload.userId },
        { $set: { tier: 'free', lastRefund: payload.chargeId, lastRefundAmount: payload.amount } }
      );
      console.log('[DB] Downgraded user:', payload.userId);
      // Automated Discord notification for downgrade
      if (payload.notify) {
        await module.exports.enqueueJob('notify', {
          userId: payload.userId,
          type: 'downgrade',
          chargeId: payload.chargeId,
          amount: payload.amount,
          message: `User ${payload.userId} downgraded to free.`
        });
      }
      break;
    }
    default:
      console.log('[DB] Unknown db_update action:', payload.action);
  }
}

// Helper to trigger Discord notifications for errors and milestones
function notifyDiscord({ userId, type, message }) {
  enqueueJob('notify', {
    userId,
    type,
    message,
  });
}

module.exports = {
  enqueueJob,
  processJob,
  notifyDiscord,
};
