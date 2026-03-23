package com.gpteemobile

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.facebook.react.bridge.*
import java.io.File
import java.nio.ByteBuffer

class ImageDecoderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "ImageDecoder"
    }

    @ReactMethod
    fun decodeImage(
        imagePath: String,
        targetWidth: Int,
        targetHeight: Int,
        promise: Promise
    ) {
        try {
            // Load bitmap from file
            val file = File(imagePath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "Image file not found: $imagePath")
                return
            }

            // Decode bitmap with inSampleSize for efficiency
            val options = BitmapFactory.Options().apply {
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }

            var bitmap = BitmapFactory.decodeFile(imagePath, options)
            if (bitmap == null) {
                promise.reject("DECODE_ERROR", "Failed to decode image")
                return
            }

            // Store original dimensions
            val originalWidth = bitmap.width
            val originalHeight = bitmap.height

            // Smart resize: preserve aspect ratio, no padding (direct resize to target)
            var padX = 0
            var padY = 0
            var resizeScale = 1.0f

            val scaledBitmap = if (bitmap.width != targetWidth || bitmap.height != targetHeight) {
                // Calculate scale to match target dimensions while preserving aspect ratio
                resizeScale = minOf(
                    targetWidth.toFloat() / bitmap.width,
                    targetHeight.toFloat() / bitmap.height
                )

                val scaledWidth = (bitmap.width * resizeScale).toInt()
                val scaledHeight = (bitmap.height * resizeScale).toInt()

                // Create scaled bitmap (no padding)
                val scaled = Bitmap.createScaledBitmap(bitmap, scaledWidth, scaledHeight, true)

                if (bitmap != scaled) bitmap.recycle()
                scaled
            } else {
                bitmap
            }

            bitmap = scaledBitmap
            val finalWidth = bitmap.width
            val finalHeight = bitmap.height

            // Extract RGB pixel data
            val pixels = IntArray(finalWidth * finalHeight)
            bitmap.getPixels(pixels, 0, finalWidth, 0, 0, finalWidth, finalHeight)

            // Convert to RGB byte array (exclude alpha channel)
            val rgbData = ByteArray(finalWidth * finalHeight * 3)
            for (i in pixels.indices) {
                val pixel = pixels[i]
                val baseIdx = i * 3
                rgbData[baseIdx] = ((pixel shr 16) and 0xFF).toByte()     // R
                rgbData[baseIdx + 1] = ((pixel shr 8) and 0xFF).toByte()  // G
                rgbData[baseIdx + 2] = (pixel and 0xFF).toByte()          // B
            }

            // Convert to base64 for React Native transfer
            val base64Data = android.util.Base64.encodeToString(
                rgbData,
                android.util.Base64.NO_WRAP
            )

            // Save cropped image to cache for display
            val cacheDir = reactApplicationContext.cacheDir
            val croppedFile = File(cacheDir, "face_detection_preview_${System.currentTimeMillis()}.jpg")
            val outputStream = java.io.FileOutputStream(croppedFile)
            bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 95, outputStream)
            outputStream.close()

            // Return result (native resolution, no transforms needed)
            val result = Arguments.createMap().apply {
                putString("data", base64Data)
                putInt("width", finalWidth)
                putInt("height", finalHeight)
                putString("croppedImageUri", "file://${croppedFile.absolutePath}")
                putInt("originalWidth", originalWidth)
                putInt("originalHeight", originalHeight)
                putInt("padX", padX)
                putInt("padY", padY)
                putDouble("resizeScale", resizeScale.toDouble())
            }

            bitmap.recycle()
            promise.resolve(result)

        } catch (e: Exception) {
            promise.reject("DECODE_ERROR", "Error decoding image: ${e.message}", e)
        }
    }

    @ReactMethod
    fun getImageDimensions(imagePath: String, promise: Promise) {
        try {
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            BitmapFactory.decodeFile(imagePath, options)

            val result = Arguments.createMap().apply {
                putInt("width", options.outWidth)
                putInt("height", options.outHeight)
            }
            promise.resolve(result)

        } catch (e: Exception) {
            promise.reject("ERROR", "Error getting dimensions: ${e.message}", e)
        }
    }
}
