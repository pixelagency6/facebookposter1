const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
// We remove the top-level require here to fix the circular dependency warning
// const { processAndPostVideo } = require('./videoProcessor');

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
  const message = update.message;
  
  if (!message) return;

  const chatId = message.chat.id;

  // 1. Handle /start command (Welcome Message)
  if (message.text && message.text.startsWith('/start')) {
    const welcomeText = `👋 **Welcome to your Facebook Auto-Poster!**\n\nI can help you upload your music videos directly to your Facebook Page.\n\n**How to use:**\n1. Click the 📎 (Paperclip) icon below.\n2. Select your video file.\n3. Add a caption (optional).\n4. Send it! 🚀\n\nI'll handle the rest.`;
    await sendMessage(chatId, welcomeText);
    return;
  }

  // 2. Check if message contains a video
  if (!message.video) {
    // If it's just text (and not /start), remind them to send a video
    if (message.text) {
        await sendMessage(chatId, "Please send me a **video file** to upload. 🎥");
    }
    return; // Ignore non-video messages
  }

  // Lazy load the processor here to ensure it is fully loaded and avoid circular dependency issues
  const { processAndPostVideo } = require('./videoProcessor');

  const videoData = message.video;
  const fileId = videoData.file_id;
  
  // Use the caption from Telegram, or a default date string if none provided
  const caption = message.caption || `Video uploaded via Telegram on ${new Date().toLocaleDateString()}`;

  console.log(`Received video from Chat ID ${chatId}. Processing...`);

  // Notify user processing started
  await sendMessage(chatId, "📥 **Video Received!**\n\nI'm working on uploading it to Facebook right now. This might take a moment... ⏳");

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

    await sendMessage(chatId, "✅ **Success!**\n\nYour video has been posted to your Facebook Page. 🎉");
    
    // Cleanup input file to save space
    if (fs.existsSync(localFilePath)) fs.unlinkSync(localFilePath);

  } catch (error) {
    console.error('Error in telegram handler:', error);
    await sendMessage(chatId, "❌ **Error**\n\nSomething went wrong while uploading your video. Please try again.");
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
      text: text,
      parse_mode: 'Markdown' // Added Markdown support for bold text
    });
  } catch (e) {
    console.error('Failed to send message:', e.message);
  }
}

module.exports = { setupWebhook, handleTelegramUpdate };
