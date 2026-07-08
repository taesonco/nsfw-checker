import { Client, Storage } from 'node-appwrite';
import { classifyImage } from './scan.js'
// This Appwrite function will be executed every time your function is triggered
export default async ({ req, res, log, error }) => {
  // You can use the Appwrite SDK to interact with other services
  // For this example, we're using the Users service
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key']);
  const storage = new Storage(client);
  const fileBuffer = await storage.getFileDownload(bucketId, fileId);
  const document = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { bucketId, fileId, name } = document;
  if (!bucketId || !fileId) {
      log('Document missing file references. Skipping processing.');
      return res.json({ success: true, message: 'No photo files to process.' });
    }

    log(`Processing new photo document: ${document.$id} for file: ${name}`);

    // 4. Download the raw photo binary buffer from Storage
    const imageBuffer = await storage.getFileDownload(bucketId, fileId);

    let result = await classifyImage(imageBuffer);
    const topResult = result[0];
    if (topResult.className === 'Porn' || topResult.className === 'Hentai') {
      console.log("❌ Flagged: This image is NSFW.");
    } else {
      console.log("✅ Cleared: This image is safe.");
    }
};
