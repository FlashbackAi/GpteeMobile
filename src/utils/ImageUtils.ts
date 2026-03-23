// Image processing utilities for face recognition
// Handles loading images from URIs and converting to tensor format

import RNFS from 'react-native-fs';

export interface ImageData {
  data: Float32Array;
  width: number;
  height: number;
}

/**
 * Load image from URI and convert to Float32Array
 * This is a simplified version - for production, use react-native-image-resizer
 * or similar library for proper image decoding
 */
export async function loadImageFromUri(uri: string): Promise<ImageData> {
  // For now, return mock data
  // In production, you need to:
  // 1. Decode the image (JPEG/PNG) to raw pixels
  // 2. Resize to model input size (e.g., 640x640 for detection)
  // 3. Convert RGB values to Float32Array
  // 4. Normalize values (e.g., [0-255] to [-1, 1])

  throw new Error('Image loading not yet implemented. Need image decoding library.');
}

/**
 * Preprocess image for detection model
 * Input: RGB image data
 * Output: Normalized tensor data ready for model input
 */
export function preprocessForDetection(
  imageData: Uint8Array,
  width: number,
  height: number,
  targetWidth: number = 640,
  targetHeight: number = 640,
): Float32Array {
  // Convert HWC (Height, Width, Channels) to CHW (Channels, Height, Width)
  // Normalize from [0, 255] to [-1, 1]

  const normalized = new Float32Array(3 * targetHeight * targetWidth);

  // Simple resize by sampling (bilinear interpolation in production)
  const scaleX = width / targetWidth;
  const scaleY = height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY = Math.floor(y * scaleY);
      const srcIdx = (srcY * width + srcX) * 3;

      const dstIdx = y * targetWidth + x;

      // Normalize to [-1, 1] and convert to CHW format
      normalized[dstIdx] = (imageData[srcIdx] / 255.0) * 2 - 1; // R
      normalized[targetHeight * targetWidth + dstIdx] = (imageData[srcIdx + 1] / 255.0) * 2 - 1; // G
      normalized[2 * targetHeight * targetWidth + dstIdx] = (imageData[srcIdx + 2] / 255.0) * 2 - 1; // B
    }
  }

  return normalized;
}

/**
 * Crop face from image based on bounding box
 */
export function cropFace(
  imageData: Uint8Array,
  width: number,
  height: number,
  bbox: { x: number; y: number; width: number; height: number },
): Uint8Array {
  const { x, y, width: bboxW, height: bboxH } = bbox;

  // Ensure bbox is within image bounds
  const startX = Math.max(0, Math.floor(x));
  const startY = Math.max(0, Math.floor(y));
  const endX = Math.min(width, Math.ceil(x + bboxW));
  const endY = Math.min(height, Math.ceil(y + bboxH));

  const croppedWidth = endX - startX;
  const croppedHeight = endY - startY;
  const croppedData = new Uint8Array(croppedWidth * croppedHeight * 3);

  for (let row = 0; row < croppedHeight; row++) {
    for (let col = 0; col < croppedWidth; col++) {
      const srcIdx = ((startY + row) * width + (startX + col)) * 3;
      const dstIdx = (row * croppedWidth + col) * 3;

      croppedData[dstIdx] = imageData[srcIdx];       // R
      croppedData[dstIdx + 1] = imageData[srcIdx + 1]; // G
      croppedData[dstIdx + 2] = imageData[srcIdx + 2]; // B
    }
  }

  return croppedData;
}
