require('dotenv').config();
const express = require('express');
const { handleTelegramUpdate, setupWebhook } = require('./telegram');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies from Telegram
app.use(express.json());

// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).send('Service is healthy');
});

// The Webhook endpoint Telegram will hit
app.post('/webhook/telegram', async (req, res) => {
  // 1. Immediately respond to Telegram to prevent timeouts/retries
  res.status(200).send('OK');

  // 2. Process the update asynchronously
  try {
    await handleTelegramUpdate(req.body);
  } catch (error) {
    console.error('Error processing update:', error);
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  // Optional: Auto-set webhook on startup (useful for dev)
  if (process.env.SET_WEBHOOK_ON_START === 'true') {
    await setupWebhook();
  }
});
