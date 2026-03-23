// Face Recognition Test Screen
// Test interface for face detection, recognition, and age/gender estimation

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { FaceRecognitionService } from '../services/FaceRecognitionService';
import { VisionModelDownloader, DownloadProgress } from '../services/VisionModelDownloader';
import { VISION_MODELS, DetectionResult } from '../services/FaceRecognitionModels';
import { colors, fonts } from '../theme/colors';
import { decodeImageToRGB, rgbToTensor, rgbToTensorRetinaFace } from '../utils/ImageDecoder';

interface TestResult {
  imageUri: string;
  detectionCount: number;
  detections: DetectionResult[];
  embeddings: Float32Array[];
  ageGenderResults: Array<{ age: number; gender: string; confidence: number }>;
  processingTime: number;
  imageWidth: number;
  imageHeight: number;
  originalWidth: number;
  originalHeight: number;
  padX: number;
  padY: number;
  resizeScale: number;
}

interface Props {
  onBack: () => void;
}

export const FaceRecognitionTestScreen: React.FC<Props> = ({ onBack }) => {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [displayDimensions, setDisplayDimensions] = useState<{ width: number; height: number } | null>(null);

  const faceService = FaceRecognitionService.getInstance();
  const downloader = VisionModelDownloader.getInstance();

  useEffect(() => {
    checkModelsAndInitialize();
  }, []);

  const checkModelsAndInitialize = async () => {
    try {
      const allDownloaded = await downloader.areAllModelsDownloaded();
      if (allDownloaded) {
        setIsInitializing(true);
        await faceService.initialize();
        setIsReady(true);
        setIsInitializing(false);
      }
    } catch (error) {
      console.error('Initialization error:', error);
      setIsInitializing(false);
    }
  };

  const handleDownloadModels = async () => {
    setIsDownloading(true);
    setDownloadProgress({});

    try {
      await downloader.downloadAllModels((modelName, progress) => {
        setDownloadProgress(prev => ({
          ...prev,
          [modelName]: progress.progress,
        }));
      });

      Alert.alert('Success', 'All models downloaded successfully!');
      await checkModelsAndInitialize();
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', `Failed to download models: ${error}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePickImage = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 1,
    });

    if (result.assets && result.assets[0]) {
      const uri = result.assets[0].uri;
      if (uri) {
        setSelectedImage(uri);
        setTestResult(null);
      }
    }
  };

  const handleProcessImage = async () => {
    if (!selectedImage) {
      Alert.alert('Error', 'Please select an image first');
      return;
    }

    if (!isReady) {
      Alert.alert('Error', 'Face recognition service not ready');
      return;
    }

    setIsProcessing(true);
    const startTime = Date.now();

    try {
      // Convert file:// URI to actual path
      const imagePath = selectedImage.replace('file://', '');

      // 1. Get original image dimensions
      const { getImageDimensions } = await import('../utils/ImageDecoder');
      const originalDims = await getImageDimensions(imagePath);
      console.log(`Original image: ${originalDims.width}x${originalDims.height}`);

      // 2. Process at native resolution with smart downscaling only if needed
      // Following AWS Rekognition approach: focus on quality, only limit extreme sizes
      // Fixed stack overflow by avoiding spread operator on large arrays
      // Can now safely process up to 6MP (~250K anchors) for high quality detection
      const maxPixels = 6_000_000; // ~3000x2000, handles most phone photos at high quality
      const originalPixels = originalDims.width * originalDims.height;

      let targetWidth = originalDims.width;
      let targetHeight = originalDims.height;

      if (originalPixels > maxPixels) {
        // Only downscale if exceeds limit
        const scale = Math.sqrt(maxPixels / originalPixels);
        targetWidth = Math.round(originalDims.width * scale);
        targetHeight = Math.round(originalDims.height * scale);
        console.log(`Downscaling: ${originalDims.width}x${originalDims.height} (${(originalPixels/1_000_000).toFixed(1)}MP) -> ${targetWidth}x${targetHeight} (${(targetWidth*targetHeight/1_000_000).toFixed(1)}MP)`);
      } else {
        console.log(`Processing at native resolution: ${targetWidth}x${targetHeight} (${(originalPixels/1_000_000).toFixed(1)}MP)`);
      }

      console.log(`Target size: ${targetWidth}x${targetHeight}`);

      // 3. Decode image at target resolution
      const {
        data: rgbData,
        width,
        height,
        padX,
        padY,
        resizeScale,
      } = await decodeImageToRGB(imagePath, targetWidth, targetHeight);

      console.log(`Image decoded: ${width}x${height}, padding=(${padX},${padY}), scale=${resizeScale}`);

      // 2. Convert to tensor format (model-specific preprocessing)
      // Detect which model is loaded based on filename
      const detectionModel = VISION_MODELS.find(m => m.type === 'detection');
      const isRetinaFace = detectionModel?.filename.includes('retinaface');

      const tensorData = isRetinaFace
        ? rgbToTensorRetinaFace(rgbData, width, height) // BGR, mean=[104,117,123]
        : rgbToTensor(rgbData, width, height);           // RGB, (x-127.5)/128

      console.log(`Tensor data prepared: ${tensorData.length} (model: ${isRetinaFace ? 'RetinaFace' : 'SCRFD'})`);

      // 3. Run face detection
      console.log('Running face detection...');
      const detections = await faceService.detectFaces(tensorData, width, height);
      console.log('Detections:', detections.length);

      const processingTime = Date.now() - startTime;

      const result: TestResult = {
        imageUri: selectedImage, // Keep original image for display
        detectionCount: detections.length,
        detections: detections,
        embeddings: [],
        ageGenderResults: [],
        processingTime,
        imageWidth: width,
        imageHeight: height,
        originalWidth: originalDims.width,
        originalHeight: originalDims.height,
        padX: padX || 0,
        padY: padY || 0,
        resizeScale: resizeScale || 1.0,
      };

      console.log(`Result: processed=${width}x${height}, original=${originalDims.width}x${originalDims.height}`);
      console.log(`Transform: padX=${padX}, padY=${padY}, scale=${resizeScale}`);
      if (detections.length > 0) {
        console.log(`First detection: bbox=(${detections[0].bbox.x}, ${detections[0].bbox.y}, ${detections[0].bbox.width}, ${detections[0].bbox.height})`);
      }

      setTestResult(result);

      Alert.alert(
        'Detection Complete',
        `Found ${detections.length} face(s) in ${processingTime}ms`,
      );
    } catch (error) {
      console.error('Processing error:', error);
      Alert.alert('Error', `Failed to process image: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderDownloadSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Download Vision Models</Text>
      <Text style={styles.description}>
        Download InsightFace ONNX models for face detection, recognition, and age/gender estimation.
      </Text>

      {VISION_MODELS.map(model => (
        <View key={model.filename} style={styles.modelItem}>
          <Text style={styles.modelName}>{model.name}</Text>
          <Text style={styles.modelSize}>{(model.size / 1_000_000).toFixed(1)} MB</Text>
          {downloadProgress[model.name] !== undefined && (
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${downloadProgress[model.name]}%` }]}
              />
            </View>
          )}
        </View>
      ))}

      <TouchableOpacity
        style={[styles.button, isDownloading && styles.buttonDisabled]}
        onPress={handleDownloadModels}
        disabled={isDownloading}>
        {isDownloading ? (
          <ActivityIndicator color={colors.button.primaryText} />
        ) : (
          <Text style={styles.buttonText}>Download All Models</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderTestSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Test Face Recognition</Text>

      {isInitializing && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent.primary} />
          <Text style={styles.loadingText}>Initializing models...</Text>
        </View>
      )}

      {isReady && (
        <>
          <TouchableOpacity style={styles.button} onPress={handlePickImage}>
            <Text style={styles.buttonText}>Pick Image</Text>
          </TouchableOpacity>

          {selectedImage && (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: selectedImage }}
                style={styles.image}
                onLayout={(event) => {
                  // Store display dimensions for proper bbox scaling
                  const { width, height } = event.nativeEvent.layout;
                  setDisplayDimensions({ width, height });
                }}
              />
              {testResult && testResult.detections.length > 0 && displayDimensions && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  {testResult.detections.map((detection, idx) => {
                    const { padX, padY, resizeScale, originalWidth, originalHeight } = testResult;

                    // Map detection coordinates back to original image space
                    const origX = (detection.bbox.x - padX) / resizeScale;
                    const origY = (detection.bbox.y - padY) / resizeScale;
                    const origW = detection.bbox.width / resizeScale;
                    const origH = detection.bbox.height / resizeScale;

                    // Calculate actual displayed image dimensions within the container
                    // Container uses resizeMode='contain', so image fits within displayDimensions
                    const containerRatio = displayDimensions.width / displayDimensions.height;
                    const imageRatio = originalWidth / originalHeight;

                    let displayedImageWidth, displayedImageHeight, offsetX, offsetY;

                    if (imageRatio > containerRatio) {
                      // Image is wider - fits to width, letterboxed top/bottom
                      displayedImageWidth = displayDimensions.width;
                      displayedImageHeight = displayDimensions.width / imageRatio;
                      offsetX = 0;
                      offsetY = (displayDimensions.height - displayedImageHeight) / 2;
                    } else {
                      // Image is taller - fits to height, letterboxed left/right
                      displayedImageHeight = displayDimensions.height;
                      displayedImageWidth = displayDimensions.height * imageRatio;
                      offsetX = (displayDimensions.width - displayedImageWidth) / 2;
                      offsetY = 0;
                    }

                    // Scale to display coordinates
                    const scaleX = displayedImageWidth / originalWidth;
                    const scaleY = displayedImageHeight / originalHeight;

                    return (
                      <React.Fragment key={idx}>
                        {/* Bounding box */}
                        <View
                          style={{
                            position: 'absolute',
                            left: offsetX + origX * scaleX,
                            top: offsetY + origY * scaleY,
                            width: origW * scaleX,
                            height: origH * scaleY,
                            borderWidth: 2,
                            borderColor: colors.accent.primary,
                          }}
                        >
                          {/* Confidence label */}
                          <View style={styles.confidenceLabel}>
                            <Text style={styles.confidenceText}>
                              {(detection.confidence * 100).toFixed(0)}%
                            </Text>
                          </View>
                        </View>

                        {/* Landmarks */}
                        {detection.landmarks.map((landmark, lIdx) => {
                          const origLandmarkX = (landmark.x - padX) / resizeScale;
                          const origLandmarkY = (landmark.y - padY) / resizeScale;

                          return (
                            <View
                              key={`${idx}-${lIdx}`}
                              style={{
                                position: 'absolute',
                                left: offsetX + origLandmarkX * scaleX - 3,
                                top: offsetY + origLandmarkY * scaleY - 3,
                                width: 6,
                                height: 6,
                                borderRadius: 3,
                                backgroundColor: '#ef4444',
                              }}
                            />
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {selectedImage && (
            <TouchableOpacity
              style={[styles.button, isProcessing && styles.buttonDisabled]}
              onPress={handleProcessImage}
              disabled={isProcessing}>
              {isProcessing ? (
                <ActivityIndicator color={colors.accent.primary} />
              ) : (
                <Text style={styles.buttonText}>Process Image</Text>
              )}
            </TouchableOpacity>
          )}

          {testResult && (
            <View style={styles.resultsContainer}>
              <Text style={styles.resultsTitle}>Results:</Text>
              <Text style={styles.resultText}>Faces detected: {testResult.detectionCount}</Text>
              <Text style={styles.resultText}>
                Processing time: {testResult.processingTime}ms
              </Text>

              {testResult.ageGenderResults.map((result, idx) => (
                <View key={idx} style={styles.faceResult}>
                  <Text style={styles.resultText}>Face {idx + 1}:</Text>
                  <Text style={styles.resultText}>  Age: {result.age}</Text>
                  <Text style={styles.resultText}>
                    Gender: {result.gender} ({(result.confidence * 100).toFixed(1)}%)
                  </Text>
                </View>
              ))}

              <Text style={styles.noteText}>
                Note: Full pipeline implementation requires image processing utilities.
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Face Recognition Test</Text>
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: isReady ? '#4ade80' : '#ef4444' }]} />
          <Text style={styles.statusText}>{isReady ? 'Ready' : 'Not Ready'}</Text>
        </View>
      </View>

      {!isReady && !isInitializing && renderDownloadSection()}
      {(isReady || isInitializing) && renderTestSection()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    marginBottom: 15,
  },
  backButtonText: {
    color: colors.accent.primary,
    fontSize: 16,
    fontFamily: fonts.medium,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 10,
    fontFamily: fonts.bold,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: colors.text.tertiary,
    fontSize: 14,
    fontFamily: fonts.regular,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 10,
    fontFamily: fonts.semiBold,
  },
  description: {
    color: colors.text.secondary,
    fontSize: 14,
    marginBottom: 20,
    lineHeight: 20,
    fontFamily: fonts.regular,
  },
  modelItem: {
    backgroundColor: colors.background.tertiary,
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  modelName: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.medium,
  },
  modelSize: {
    color: colors.text.tertiary,
    fontSize: 12,
    marginTop: 4,
    fontFamily: fonts.regular,
  },
  progressBar: {
    height: 4,
    backgroundColor: colors.background.secondary,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent.primary,
  },
  button: {
    backgroundColor: colors.button.primary,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.button.primaryText,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: colors.text.secondary,
    marginTop: 10,
    fontFamily: fonts.regular,
  },
  imageContainer: {
    marginTop: 20,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  image: {
    width: '100%',
    height: 300,
    resizeMode: 'contain',
    backgroundColor: colors.background.secondary,
  },
  resultsContainer: {
    backgroundColor: colors.background.tertiary,
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
    borderWidth: 1,
    borderColor: colors.terminal.greenDim,
  },
  resultsTitle: {
    color: colors.accent.primary,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
    fontFamily: fonts.semiBold,
  },
  resultText: {
    color: colors.text.secondary,
    fontSize: 14,
    marginBottom: 5,
    fontFamily: fonts.regular,
  },
  faceResult: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  noteText: {
    color: colors.text.tertiary,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 15,
    fontFamily: fonts.light,
  },
  confidenceLabel: {
    position: 'absolute',
    top: -24,
    left: 0,
    backgroundColor: colors.accent.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  confidenceText: {
    color: colors.background.primary,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: fonts.bold,
  },
});
