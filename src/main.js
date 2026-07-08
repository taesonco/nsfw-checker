import { Client, Storage } from 'node-appwrite';
import * as tf from '@tensorflow/tfjs';
import * as nsfw from 'nsfwjs';
import jpeg from 'jpeg-js';

// Global cache variable for the loaded TensorFlow model
let modelCache = null;

/**
 * Internal helper to load the model once and cache it
 */
async function getModel() {
  if (!modelCache) {
    modelCache = await nsfw.load();
  }
  return modelCache;
}

/**
 * Decodes a JPEG buffer into a 3D Tensor using pure JS
 */
function convertBufferToTensor(imageBuffer) {
  // Decode the JPEG data to raw pixels
  const rawImageData = jpeg.decode(imageBuffer, { useTStringInJS: true });
  const { width, height, data } = rawImageData;
  
  // Convert the Uint8Array pixel data (RGBA) into a 3-channel (RGB) float array
  const buffer = new Float32Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    buffer[i * 3] = data[i * 4];         // Red
    buffer[i * 3 + 1] = data[i * 4 + 1]; // Green
    buffer[i * 3 + 2] = data[i * 4 + 2]; // Blue
  }
  
  // Create a 3D tensor expected by nsfwjs
  return tf.tensor3d(buffer, [height, width, 3], 'int32');
}

/**
 * Internal helper to handle image classification safely
 */
async function classifyImage(imageBuffer) {
  try {
    const model = await getModel();

    // Decode buffer purely in JS (bypasses native C++ / glibc entirely)
    const tensor = convertBufferToTensor(imageBuffer);

    // Get classification predictions
    const predictions = await model.classify(tensor);
    
    // Clean up memory to avoid leaks
    tensor.dispose();

    return predictions;
  } catch (error) {
    console.error("NSFWJS Classification Error:", error);
    throw error;
  }
}

/**
 * Appwrite Function Entrypoint
 */
export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_FUNCTION_API_ENDPOINT)
    .setProject(process.env.APPWRITE_FUNCTION_PROJECT_ID)
    .setKey(req.headers['x-appwrite-key']);
    
  const storage = new Storage(client);

  const bucketId = document.bucketId;
  const fileId = document.$id; 
  const name = document.name;

  if (!bucketId || !fileId) {
    log('Document missing file references. Skipping processing.');
    return res.json({ success: true, message: 'No photo files to process.' });
  }

  log(`Processing photo document: ${document.$id || 'unknown'} for file: ${name || 'unknown'}`);

  try {
    // 1. Download the raw photo binary buffer from Appwrite Storage
    const imageBuffer = await storage.getFileDownload(bucketId, fileId);

    // 2. Classify the image using the local pure-JS helper
    const result = await classifyImage(imageBuffer);
    const topResult = result[0];
    
    // 3. Log results based on classification
    if (topResult.className === 'Porn' || topResult.className === 'Hentai') {
      log(`❌ Flagged: This image is NSFW. Top category: ${topResult.className} (${(topResult.probability * 100).toFixed(2)}%)`);
    } else {
      log(`✅ Cleared: Image is safe. Top category: ${topResult.className}`);
    }

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