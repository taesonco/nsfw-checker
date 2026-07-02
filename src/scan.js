const tf = require('@tensorflow/tfjs-node'); // Use '@tensorflow/tfjs' if in browser
const nsfw = require('nsfwjs');

let model;

/**
 * Helper function to load the model once and cache it
 */
async function getModel() {
  if (!model) {
    // Loads the default MobilenetV2 model
    model = await nsfw.load();
  }
  return model;
}

/**
 * The core function to check an image
 * @param {Buffer} imageBuffer - The image file buffer to classify
 * @returns {Promise<Array>} - Array of predictions and probabilities
 */
export default async function classifyImage(imageBuffer) {
  try {
    // 1. Initialize/fetch the loaded model
    const currentModel = await getModel();

    // 2. Decode the image buffer into a TensorFlow tensor
    const tensor = tf.node.decodeImage(imageBuffer, 3);

    // 3. Get predictions
    const predictions = await currentModel.classify(tensor);

    // 4. Clean up memory to avoid memory leaks
    tensor.dispose();

    return predictions;
  } catch (error) {
    console.error("NSFWJS Classification Error:", error);
    throw error;
  }
}

module.exports = { classifyImage };