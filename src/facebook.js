const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { processAndPostVideo } = require('./videoProcessor');

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Set the webhook URL
async function setupWebhook() {
  // RENDER_EXTERNAL_URL is automatically provided by Render
  const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook/telegram`;
  try {
    await axios.post(`${TELEGRAM_API}/setWebhook`, { url: webhookUrl });
    console.log(`Webhook set to: ${webhookUrl}`);
  } catch (error) {
    console.error('Failed to set webhook:', error.message);
  }
}

// Main handler for incoming updates
async function handleTelegramUpdate(update) {
  // Check if message contains a video
  if (!update.message || !update.message.video) {
    return; // Ignore non-video messages
  }

  const chatId = update.message.chat.id;
  const videoData = update.message.video;
  const fileId = videoData.file_id;
  
  // Use the caption from Telegram, or a default date string if none provided
  const caption = update.message.caption || `Video uploaded via Telegram on ${new Date().toLocaleDateString()}`;

  console.log(`Received video from Chat ID ${chatId}. Processing...`);

  // Notify user processing started
  await sendMessage(chatId, "Video received! 🎥 Uploading to Facebook...");

  try {
    // 1. Get File Path from Telegram API
    const fileRes = await axios.get(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;

    // 2. Download to Ephemeral Disk (/tmp)
    const localFilePath = path.join(os.tmpdir(), `input_${Date.now()}.mp4`);
    await downloadFile(downloadUrl, localFilePath);

    // 3. Hand off to Processor (Direct Upload)
    await processAndPostVideo(localFilePath, caption);

    await sendMessage(chatId, "✅ Done! Video posted to your Facebook Page.");
    
    // Cleanup input file to save space
    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

  } catch (error) {
    console.error('Error in telegram handler:', error);
    await sendMessage(chatId, "❌ An error occurred while uploading your video.");
  }
}

// Helper: Download stream to file
async function downloadFile(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Helper: Send text message back to user
async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: chatId,
      text: text
    });
  } catch (e) {
    console.error('Failed to send message:', e.message);
  }
}

module.exports = { setupWebhook, handleTelegramUpdate };
