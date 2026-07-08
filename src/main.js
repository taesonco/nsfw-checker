import { Client, Storage } from 'node-appwrite';
import * as tf from '@tensorflow/tfjs-node';
import * as nsfw from 'nsfwjs';

// Global cache variable for the loaded TensorFlow model
let modelCache = null;

/**
 * Internal helper to load the model once and cache it across executions
 */
async function getModel() {
  if (!modelCache) {
    // Loads the default MobilenetV2 model from nsfwjs
    modelCache = await nsfw.load();
  }
  return modelCache;
}

/**
 * Internal helper to decode the image buffer and get NSFW predictions
 */
async function classifyImage(imageBuffer) {
  try {
    const model = await getModel();

    // Decode the image buffer into a 3-channel TensorFlow tensor
    const tensor = tf.node.decodeImage(imageBuffer, 3);

    // Get classification predictions
    const predictions = await model.classify(tensor);

    // Crucial: Clean up tensor memory to avoid severe memory leaks
    tensor.dispose();

    return predictions;
  } catch (error) {
    console.error("NSFWJS Classification Error:", error);
    throw error;
  }
}

/**
 * Appwrite Function Entrypoint
 * This executes every time your function is triggered.
 */
export default async ({ req, res, log, error }) => {
  // Initialize Appwrite SDK Client
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key']);
    
  const storage = new Storage(client);

  // Parse incoming webhook/trigger payload safely
  const document = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { bucketId, fileId, name } = document || {};

  if (!bucketId || !fileId) {
    log('Document missing file references. Skipping processing.');
    return res.json({ success: true, message: 'No photo files to process.' });
  }

  log(`Processing photo document: ${document.$id || 'unknown'} for file: ${name || 'unknown'}`);

  try {
    // 1. Download the raw photo binary buffer from Appwrite Storage
    const imageBuffer = await storage.getFileDownload(bucketId, fileId);

    // 2. Classify the image using the local helper function
    const result = await classifyImage(imageBuffer);
    const topResult = result[0];
    
    // 3. Log results based on classification
    if (topResult.className === 'Porn' || topResult.className === 'Hentai') {
      log(`❌ Flagged: This image is NSFW. Top category: ${topResult.className} (${(topResult.probability * 100).toFixed(2)}%)`);
    } else {
      log(`✅ Cleared: Image is safe. Top category: ${topResult.className}`);
    }

    // 4. Return response payload
    return res.json({ 
      success: true, 
      isSafe: !['Porn', 'Hentai'].includes(topResult.className),
      topCategory: topResult.className,
      confidence: topResult.probability
    });

  } catch (err) {
    error(`Failed processing image: ${err.message}`);
    return res.json({ success: false, error: err.message });
  }
};