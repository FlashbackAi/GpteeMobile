// Native image decoder module
// Decodes JPEG/PNG images to raw RGB pixel data for ONNX models

import { NativeModules } from 'react-native';

interface ImageDecoderModule {
  decodeImage(
    imagePath: string,
    targetWidth: number,
    targetHeight: number,
  ): Promise<{
    data: string; // base64 encoded RGB data
    width: number;
    height: number;
    croppedImageUri?: string;
    originalWidth?: number;
    originalHeight?: number;
    padX?: number;
    padY?: number;
    resizeScale?: number;
  }>;

  getImageDimensions(imagePath: string): Promise<{
    width: number;
    height: number;
  }>;
}

const { ImageDecoder } = NativeModules;

if (!ImageDecoder) {
  throw new Error('ImageDecoder native module not found. Did you rebuild the app?');
}

/**
 * Decode image from file path to RGB pixel data
 * Returns Uint8Array with RGB values (0-255)
 */
export async function decodeImageToRGB(
  imagePath: string,
  targetWidth: number = 640,
  targetHeight: number = 640,
): Promise<{
  data: Uint8Array;
  width: number;
  height: number;
  croppedImageUri?: string;
  originalWidth?: number;
  originalHeight?: number;
  padX?: number;
  padY?: number;
  resizeScale?: number;
}> {
  const result = await (ImageDecoder as ImageDecoderModule).decodeImage(
    imagePath,
    targetWidth,
    targetHeight,
  );

  // Decode base64 to Uint8Array
  const binaryString = atob(result.data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return {
    data: bytes,
    width: result.width,
    height: result.height,
    croppedImageUri: result.croppedImageUri,
    originalWidth: result.originalWidth,
    originalHeight: result.originalHeight,
    padX: result.padX,
    padY: result.padY,
    resizeScale: result.resizeScale,
  };
}

/**
 * Get image dimensions without decoding full image
 */
export async function getImageDimensions(
  imagePath: string,
): Promise<{ width: number; height: number }> {
  return await (ImageDecoder as ImageDecoderModule).getImageDimensions(imagePath);
}

/**
 * Convert Uint8Array RGB data to Float32Array for ONNX
 * SCRFD official preprocessing: RGB order, mean=[127.5, 127.5, 127.5], std=[128.0, 128.0, 128.0]
 */
export function rgbToTensor(
  rgbData: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const tensorData = new Float32Array(3 * height * width);

  // SCRFD preprocessing: (pixel - 127.5) / 128.0
  const mean = 127.5;
  const std = 128.0;

  for (let i = 0; i < rgbData.length; i += 3) {
    const pixelIdx = i / 3;

    // Normalize and convert to CHW format (RGB order)
    tensorData[pixelIdx] = (rgbData[i] - mean) / std; // R channel
    tensorData[height * width + pixelIdx] = (rgbData[i + 1] - mean) / std; // G channel
    tensorData[2 * height * width + pixelIdx] = (rgbData[i + 2] - mean) / std; // B channel
  }

  return tensorData;
}

/**
 * Convert Uint8Array RGB data to Float32Array for RetinaFace ONNX model
 * RetinaFace preprocessing: BGR order, mean=[104, 117, 123] (no std normalization)
 */
export function rgbToTensorRetinaFace(
  rgbData: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const tensorData = new Float32Array(3 * height * width);

  // RetinaFace preprocessing: BGR order with mean subtraction
  const meanB = 104;
  const meanG = 117;
  const meanR = 123;

  for (let i = 0; i < rgbData.length; i += 3) {
    const pixelIdx = i / 3;
    const r = rgbData[i];
    const g = rgbData[i + 1];
    const b = rgbData[i + 2];

    // Convert RGB to BGR and subtract mean (CHW format)
    tensorData[pixelIdx] = b - meanB; // B channel (first in BGR)
    tensorData[height * width + pixelIdx] = g - meanG; // G channel
    tensorData[2 * height * width + pixelIdx] = r - meanR; // R channel (last in BGR)
  }

  return tensorData;
}
