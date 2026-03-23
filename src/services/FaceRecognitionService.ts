// Face Recognition Service - Handles all vision inference operations
// Uses InsightFace ONNX models with ONNX Runtime

import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import { VisionModelDownloader } from './VisionModelDownloader';
import { VISION_MODELS, DetectionResult, RecognitionResult, AgeGenderResult } from './FaceRecognitionModels';

export class FaceRecognitionService {
  private static instance: FaceRecognitionService;
  private detectionSession: InferenceSession | null = null;
  private recognitionSession: InferenceSession | null = null;
  private ageGenderSession: InferenceSession | null = null;
  private downloader: VisionModelDownloader;
  private isInitialized = false;

  private constructor() {
    this.downloader = VisionModelDownloader.getInstance();
  }

  static getInstance(): FaceRecognitionService {
    if (!FaceRecognitionService.instance) {
      FaceRecognitionService.instance = new FaceRecognitionService();
    }
    return FaceRecognitionService.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('FaceRecognitionService already initialized');
      return;
    }

    console.log('Initializing FaceRecognitionService...');

    // Check if all models are downloaded
    const allDownloaded = await this.downloader.areAllModelsDownloaded();
    if (!allDownloaded) {
      throw new Error(
        'Vision models not downloaded. Please download models first using VisionModelDownloader.',
      );
    }

    // Load ONNX models
    await this.loadModels();

    this.isInitialized = true;
    console.log('FaceRecognitionService initialized successfully');
  }

  private async loadModels(): Promise<void> {
    try {
      // Load detection model
      const detectionModel = VISION_MODELS.find(m => m.type === 'detection');
      if (detectionModel) {
        const detectionPath = this.downloader.getModelPath(detectionModel);
        console.log('Loading detection model from:', detectionPath);
        this.detectionSession = await InferenceSession.create(detectionPath);
        console.log('Detection model loaded');
      }

      // Load recognition model
      const recognitionModel = VISION_MODELS.find(m => m.type === 'recognition');
      if (recognitionModel) {
        const recognitionPath = this.downloader.getModelPath(recognitionModel);
        console.log('Loading recognition model from:', recognitionPath);
        this.recognitionSession = await InferenceSession.create(recognitionPath);
        console.log('Recognition model loaded');
      }

      // Load age-gender model
      const ageGenderModel = VISION_MODELS.find(m => m.type === 'age-gender');
      if (ageGenderModel) {
        const ageGenderPath = this.downloader.getModelPath(ageGenderModel);
        console.log('Loading age-gender model from:', ageGenderPath);
        this.ageGenderSession = await InferenceSession.create(ageGenderPath);
        console.log('Age-gender model loaded');
      }
    } catch (error) {
      console.error('Error loading models:', error);
      throw error;
    }
  }

  async detectFaces(imageData: Float32Array, width: number, height: number): Promise<DetectionResult[]> {
    if (!this.detectionSession) {
      throw new Error('Detection model not loaded. Call initialize() first.');
    }

    try {
      // Create input tensor with shape [1, 3, height, width]
      const inputTensor = new Tensor('float32', imageData, [1, 3, height, width]);

      const inputNames = this.detectionSession.inputNames;
      console.log('Model input names:', inputNames);

      const feeds: Record<string, Tensor> = {};
      feeds[inputNames[0]] = inputTensor;

      const results = await this.detectionSession.run(feeds);
      const outputKeys = Object.keys(results);
      console.log('Detection output names:', outputKeys);

      // Detect model type based on output keys
      const isYuNet = outputKeys.some(k => k.startsWith('cls_') || k.startsWith('obj_'));
      const hasLocConfLandmarks = outputKeys.includes('loc') && outputKeys.includes('conf') && outputKeys.includes('landmarks');
      const isRetinaFace = hasLocConfLandmarks && outputKeys.length === 3;
      const isSCRFD = outputKeys.some(k => k.includes('stride')) || (outputKeys.length >= 9 && outputKeys.every(k => !isNaN(Number(k))));
      const isInsightFace = !isRetinaFace && !isSCRFD && outputKeys.every(k => !isNaN(Number(k)));

      const modelType = isYuNet ? 'YuNet' : isRetinaFace ? 'RetinaFace' : isSCRFD ? 'SCRFD' : isInsightFace ? 'InsightFace' : 'Unknown';
      console.log(`Detected model type: ${modelType}`);

      // Log output shapes for debugging
      Object.keys(results).forEach(key => {
        console.log(`Output ${key} shape:`, results[key].dims, 'size:', results[key].data.length);
      });

      // Use appropriate parser
      if (isRetinaFace) {
        return this.parseRetinaFaceResults(results, width, height);
      } else if (isSCRFD) {
        return this.parseSCRFDResults(results, width, height);
      } else if (isYuNet) {
        return this.parseYuNetResults(results, width, height);
      } else {
        return this.parseInsightFaceResults(results, width, height);
      }
    } catch (error) {
      console.error('Face detection error:', error);
      throw error;
    }
  }

  async extractEmbedding(faceImageData: Float32Array, width: number, height: number): Promise<RecognitionResult> {
    if (!this.recognitionSession) {
      throw new Error('Recognition model not loaded. Call initialize() first.');
    }

    try {
      // Create input tensor [1, 3, 112, 112]
      const inputTensor = new Tensor('float32', faceImageData, [1, 3, 112, 112]);

      const inputNames = this.recognitionSession.inputNames;
      const feeds: Record<string, Tensor> = {};
      feeds[inputNames[0]] = inputTensor;

      const results = await this.recognitionSession.run(feeds);

      // Extract embedding (512-d vector)
      const embeddingTensor = results['output'] || results[Object.keys(results)[0]];
      const embedding = embeddingTensor.data as Float32Array;

      return { embedding };
    } catch (error) {
      console.error('Face recognition error:', error);
      throw error;
    }
  }

  async estimateAgeGender(faceImageData: Float32Array, width: number, height: number): Promise<AgeGenderResult> {
    if (!this.ageGenderSession) {
      throw new Error('Age-Gender model not loaded. Call initialize() first.');
    }

    try {
      // Age-gender model expects 96x96 input (not 112x112)
      const inputTensor = new Tensor('float32', faceImageData, [1, 3, width, height]);

      const inputNames = this.ageGenderSession.inputNames;
      const feeds: Record<string, Tensor> = {};
      feeds[inputNames[0]] = inputTensor;

      const results = await this.ageGenderSession.run(feeds);

      // Parse age and gender results
      return this.parseAgeGenderResults(results);
    } catch (error) {
      console.error('Age-gender estimation error:', error);
      throw error;
    }
  }



  // Post-processing helpers

  private parseRetinaFaceResults(results: Record<string, Tensor>, imgWidth: number, imgHeight: number): DetectionResult[] {
    // RetinaFace-MobileNetV2 output format:
    // - loc: [1, N, 4] - bbox offsets (cx, cy, w, h) relative to anchors
    // - conf: [1, N, 2] - [background, face] class scores (logits)
    // - landmarks: [1, N, 10] - 5 facial landmarks offsets

    const locTensor = results['loc'];
    const confTensor = results['conf'];
    const landmarksTensor = results['landmarks'];

    if (!locTensor || !confTensor || !landmarksTensor) {
      console.error('Missing RetinaFace outputs');
      return [];
    }

    const numAnchors = confTensor.dims[1];
    const locData = locTensor.data as Float32Array;
    const confData = confTensor.data as Float32Array;
    const landmarksData = landmarksTensor.data as Float32Array;

    console.log(`RetinaFace: ${numAnchors} anchors`);

    // Generate prior anchors for RetinaFace
    const priors = this.generateRetinaFacePriors(imgWidth, imgHeight);
    if (priors.length !== numAnchors) {
      console.error(`Prior mismatch: expected ${numAnchors}, got ${priors.length}`);
      return [];
    }

    // Check raw confidence scores first
    let rawMin = Infinity, rawMax = -Infinity;
    for (let i = 0; i < numAnchors; i++) {
      const bgScore = confData[i * 2];
      const faceScore = confData[i * 2 + 1];
      if (bgScore < rawMin) rawMin = bgScore;
      if (bgScore > rawMax) rawMax = bgScore;
      if (faceScore < rawMin) rawMin = faceScore;
      if (faceScore > rawMax) rawMax = faceScore;
    }
    console.log(`Raw conf range: ${rawMin.toFixed(4)} to ${rawMax.toFixed(4)}`);

    // Extract face confidence scores
    const faceScores = new Float32Array(numAnchors);
    const needsSoftmax = rawMax > 1.5 || rawMin < -0.5; // Detect if logits or probabilities

    if (needsSoftmax) {
      console.log('Applying softmax to confidence scores');
      for (let i = 0; i < numAnchors; i++) {
        const bgScore = confData[i * 2];
        const faceScore = confData[i * 2 + 1];
        const expBg = Math.exp(bgScore);
        const expFace = Math.exp(faceScore);
        const sum = expBg + expFace;
        faceScores[i] = expFace / sum;
      }
    } else {
      console.log('Using raw face scores (already normalized)');
      for (let i = 0; i < numAnchors; i++) {
        faceScores[i] = confData[i * 2 + 1]; // Face class score
      }
    }

    // Find final score range
    let minScore = Infinity;
    let maxScore = -Infinity;
    for (let i = 0; i < faceScores.length; i++) {
      if (faceScores[i] < minScore) minScore = faceScores[i];
      if (faceScores[i] > maxScore) maxScore = faceScores[i];
    }
    console.log(`Face confidence range: ${minScore.toFixed(4)} to ${maxScore.toFixed(4)}`);

    const scoreThreshold = 0.5; // Standard threshold for RetinaFace
    const detections: DetectionResult[] = [];

    // Variance for decoding (RetinaFace standard)
    const variance = [0.1, 0.2];

    // Decode anchors and process all above threshold
    for (let i = 0; i < numAnchors; i++) {
      const score = faceScores[i];

      if (score > scoreThreshold) {
        const prior = priors[i];

        // Decode bbox: center + offset * variance * size
        const cx = prior.cx + locData[i * 4] * variance[0] * prior.w;
        const cy = prior.cy + locData[i * 4 + 1] * variance[0] * prior.h;
        const w = prior.w * Math.exp(locData[i * 4 + 2] * variance[1]);
        const h = prior.h * Math.exp(locData[i * 4 + 3] * variance[1]);

        // Convert center format to corner format
        const x1 = (cx - w / 2) * imgWidth;
        const y1 = (cy - h / 2) * imgHeight;
        const x2 = (cx + w / 2) * imgWidth;
        const y2 = (cy + h / 2) * imgHeight;

        const width = x2 - x1;
        const height = y2 - y1;

        // Skip invalid boxes
        if (width <= 0 || height <= 0 || x1 < 0 || y1 < 0) {
          continue;
        }

        // Decode landmarks
        const landmarks: Array<{ x: number; y: number }> = [];
        for (let j = 0; j < 5; j++) {
          const lx = (prior.cx + landmarksData[i * 10 + j * 2] * variance[0] * prior.w) * imgWidth;
          const ly = (prior.cy + landmarksData[i * 10 + j * 2 + 1] * variance[0] * prior.h) * imgHeight;
          landmarks.push({ x: lx, y: ly });
        }

        detections.push({
          bbox: { x: x1, y: y1, width, height },
          confidence: score,
          landmarks,
        });
      }
    }

    console.log(`Found ${detections.length} faces with confidence > ${scoreThreshold}`);

    // Apply NMS
    const nmsThreshold = 0.4;
    const finalDetections = this.applyNMS(detections, nmsThreshold);
    console.log(`After NMS: ${finalDetections.length} faces`);

    return finalDetections;
  }

  private generateRetinaFacePriors(imgWidth: number, imgHeight: number): Array<{ cx: number; cy: number; w: number; h: number }> {
    // RetinaFace MobileNetV2 prior configuration
    // Feature maps at strides: [8, 16, 32]
    // Anchor sizes: [[16, 32], [64, 128], [256, 512]]
    const minSizes = [[16, 32], [64, 128], [256, 512]];
    const steps = [8, 16, 32];
    const priors: Array<{ cx: number; cy: number; w: number; h: number }> = [];

    for (let k = 0; k < steps.length; k++) {
      const step = steps[k];
      const minSize = minSizes[k];

      const featureWidth = Math.ceil(imgWidth / step);
      const featureHeight = Math.ceil(imgHeight / step);

      for (let i = 0; i < featureHeight; i++) {
        for (let j = 0; j < featureWidth; j++) {
          for (const size of minSize) {
            const cx = (j + 0.5) * step / imgWidth;
            const cy = (i + 0.5) * step / imgHeight;
            const w = size / imgWidth;
            const h = size / imgHeight;
            priors.push({ cx, cy, w, h });
          }
        }
      }
    }

    console.log(`Generated ${priors.length} RetinaFace priors`);
    return priors;
  }

  private parseSCRFDResults(results: Record<string, Tensor>, imgWidth: number, imgHeight: number): DetectionResult[] {
    // SCRFD outputs: 9 tensors for 3 strides (8, 16, 32)
    // Each stride has: [scores, bbox, kps]
    const detections: DetectionResult[] = [];
    const scoreThreshold = 0.3; // Very low threshold to catch all possible faces
    const nmsThreshold = 0.3; // Lower NMS to keep more candidates

    try {
      const outputKeys = Object.keys(results);

      // Handle numeric output names (e.g., "448", "451", "454")
      // SCRFD outputs are in order: [score, bbox, kps] for each stride
      // Sort keys numerically to maintain order
      const sortedKeys = outputKeys.sort((a, b) => parseInt(a) - parseInt(b));

      console.log('Sorted output keys:', sortedKeys);

      // Group outputs by stride
      // Stride 8: 12800 anchors (80x80 grid)
      // Stride 16: 3200 anchors (40x80 grid)
      // Stride 32: 800 anchors (20x20 grid)
      const strideGroups: Array<{stride: number, scoreKey: string, bboxKey: string, kpsKey: string}> = [];

      for (let i = 0; i < sortedKeys.length; i += 3) {
        const key1 = sortedKeys[i];
        const key2 = sortedKeys[i + 1];
        const key3 = sortedKeys[i + 2];

        if (!key1 || !key2 || !key3) continue;

        // Identify which is which by shape
        let scoreKey = '', bboxKey = '', kpsKey = '';

        [key1, key2, key3].forEach(key => {
          const dims = results[key].dims;
          const lastDim = dims[dims.length - 1];
          if (lastDim === 1) scoreKey = key;
          else if (lastDim === 4) bboxKey = key;
          else if (lastDim === 10) kpsKey = key;
        });

        if (!scoreKey || !bboxKey) {
          console.log(`Warning: Could not identify outputs in group [${key1}, ${key2}, ${key3}]`);
          continue;
        }

        // Determine stride from anchor count and image dimensions
        // For dynamic input sizes, calculate stride based on grid dimensions
        const numAnchors = results[scoreKey].dims[0];

        // Try each stride to find which one matches the anchor count
        let stride = 8;
        const gridSize8 = Math.ceil(imgWidth / 8) * Math.ceil(imgHeight / 8);
        const gridSize16 = Math.ceil(imgWidth / 16) * Math.ceil(imgHeight / 16);
        const gridSize32 = Math.ceil(imgWidth / 32) * Math.ceil(imgHeight / 32);

        if (numAnchors === gridSize16) stride = 16;
        else if (numAnchors === gridSize32) stride = 32;
        else stride = 8; // Default to 8

        strideGroups.push({stride, scoreKey, bboxKey, kpsKey});
      }

      console.log('SCRFD stride groups:', strideGroups.map(g => `${g.stride}:${g.scoreKey}`));

      // SCRFD uses 3 strides: 8, 16, 32
      for (const {stride, scoreKey, bboxKey, kpsKey} of strideGroups) {
        if (!scoreKey || !bboxKey) {
          console.log(`Missing SCRFD outputs for stride ${stride}`);
          continue;
        }

        const scores = results[scoreKey].data as Float32Array;
        const bboxes = results[bboxKey].data as Float32Array;
        const landmarks = kpsKey ? (results[kpsKey].data as Float32Array) : null;

        const scoreDims = results[scoreKey].dims;
        const numAnchors = scoreDims[0];
        const gridHeight = Math.ceil(imgHeight / stride);
        const gridWidth = Math.ceil(imgWidth / stride);

        // Debug: Check score range for this stride (avoid spread for large arrays)
        let maxScore = -Infinity;
        let minScore = Infinity;
        for (let i = 0; i < scores.length; i++) {
          if (scores[i] > maxScore) maxScore = scores[i];
          if (scores[i] < minScore) minScore = scores[i];
        }
        console.log(`SCRFD stride=${stride}: ${numAnchors} anchors, grid=${gridWidth}x${gridHeight}, scores=[${minScore.toFixed(4)}, ${maxScore.toFixed(4)}]`);

        let scoreAboveThreshold = 0;
        let validBoxes = 0;

        for (let i = 0; i < numAnchors; i++) {
          const score = scores[i];

          if (score > scoreThreshold) {
            scoreAboveThreshold++;

            // Calculate anchor position
            const anchorY = Math.floor(i / gridWidth);
            const anchorX = i % gridWidth;
            const anchorCenterX = (anchorX + 0.5) * stride;
            const anchorCenterY = (anchorY + 0.5) * stride;

            // SCRFD outputs: [left, top, right, bottom] distances from anchor (normalized)
            // Need to multiply by stride to get pixel distances
            const bboxOffset = i * 4;
            const rawLeft = bboxes[bboxOffset];
            const rawTop = bboxes[bboxOffset + 1];
            const rawRight = bboxes[bboxOffset + 2];
            const rawBottom = bboxes[bboxOffset + 3];

            // Convert normalized distances to pixel distances
            const left = rawLeft * stride;
            const top = rawTop * stride;
            const right = rawRight * stride;
            const bottom = rawBottom * stride;

            // Calculate absolute coordinates from anchor center
            let x1 = anchorCenterX - left;
            let y1 = anchorCenterY - top;
            let x2 = anchorCenterX + right;
            let y2 = anchorCenterY + bottom;

            // Image is now flipped in rgbToTensor(), so no need to flip coordinates
            const flipY = false;
            if (flipY) {
              y1 = imgHeight - y1;
              y2 = imgHeight - y2;
              [y1, y2] = [y2, y1]; // Swap so y1 < y2
            }

            const width = x2 - x1;
            const height = y2 - y1;

            if (scoreAboveThreshold <= 3) {
              console.log(`Candidate ${scoreAboveThreshold}: score=${score.toFixed(4)}, anchor=[${anchorX}, ${anchorY}] @ [${anchorCenterX.toFixed(1)}, ${anchorCenterY.toFixed(1)}], raw=[${rawLeft.toFixed(1)}, ${rawTop.toFixed(1)}, ${rawRight.toFixed(1)}, ${rawBottom.toFixed(1)}], pixel=[${left.toFixed(1)}, ${top.toFixed(1)}, ${right.toFixed(1)}, ${bottom.toFixed(1)}], bbox=[${x1.toFixed(1)}, ${y1.toFixed(1)}, ${x2.toFixed(1)}, ${y2.toFixed(1)}], size=${width.toFixed(1)}x${height.toFixed(1)}`);
            }

            // Filter valid boxes
            if (x1 >= 0 && y1 >= 0 && x2 <= imgWidth && y2 <= imgHeight && width > 10 && height > 10) {
              validBoxes++;
              // Extract 5 landmarks if available (already in pixel coordinates)
              const landmarkPoints: Array<{ x: number; y: number }> = [];
              if (landmarks) {
                const kpsOffset = i * 10;
                for (let k = 0; k < 5; k++) {
                  const lx = anchorCenterX + landmarks[kpsOffset + k * 2];
                  const ly = anchorCenterY + landmarks[kpsOffset + k * 2 + 1];
                  landmarkPoints.push({ x: lx, y: ly });
                }
              }

              detections.push({
                bbox: { x: x1, y: y1, width, height },
                confidence: score,
                landmarks: landmarkPoints,
              });

              if (detections.length <= 5) {
                console.log(`SCRFD face ${detections.length}: stride=${stride}, bbox=[${x1.toFixed(1)}, ${y1.toFixed(1)}, ${width.toFixed(1)}, ${height.toFixed(1)}], score=${score.toFixed(3)}`);
              }
            }
          }
        }

        console.log(`Stride ${stride}: ${scoreAboveThreshold} scores above threshold, ${validBoxes} valid boxes`);

        // Log all detections for this stride to debug where faces are being found
        if (validBoxes > 0 && detections.length > 0) {
          const strideDetections = detections.slice(-validBoxes);
          const yCoords = strideDetections.map(d => Math.round(d.bbox.y)).sort((a,b) => a-b);
          console.log(`Stride ${stride} Y-coordinates: [${yCoords.join(', ')}]`);
        }
      }

      console.log(`Found ${detections.length} faces with SCRFD (before NMS)`);

      // Apply NMS
      const nmsDetections = this.applyNMS(detections, nmsThreshold);
      console.log(`After NMS: ${nmsDetections.length} faces`);

      return nmsDetections;
    } catch (error) {
      console.error('Error parsing SCRFD results:', error);
      return [];
    }
  }

  private parseYuNetResults(results: Record<string, Tensor>, imgWidth: number, imgHeight: number): DetectionResult[] {
    // YuNet outputs: cls_8/16/32, obj_8/16/32, bbox_8/16/32, kps_8/16/32
    const detections: DetectionResult[] = [];
    const scoreThreshold = 0.6; // Balanced threshold

    try {
      // Check raw score ranges for debugging
      const cls8 = results['cls_8'].data as Float32Array;
      const obj8 = results['obj_8'].data as Float32Array;
      const bbox8 = results['bbox_8'].data as Float32Array;

      // Avoid spread operator for large arrays (causes stack overflow)
      let maxCls = -Infinity, maxObj = -Infinity, minObj = Infinity;
      for (let i = 0; i < cls8.length; i++) {
        if (cls8[i] > maxCls) maxCls = cls8[i];
      }
      for (let i = 0; i < obj8.length; i++) {
        if (obj8[i] > maxObj) maxObj = obj8[i];
        if (obj8[i] < minObj) minObj = obj8[i];
      }

      console.log(`Score ranges: cls max=${maxCls.toFixed(4)}, obj range=[${minObj.toFixed(4)}, ${maxObj.toFixed(4)}]`);
      console.log(`Raw samples: cls[0]=${cls8[0].toFixed(4)}, obj[0]=${obj8[0].toFixed(4)}, bbox[0-3]=[${bbox8[0].toFixed(4)}, ${bbox8[1].toFixed(4)}, ${bbox8[2].toFixed(4)}, ${bbox8[3].toFixed(4)}]`);

      // Process each scale (8, 16, 32 stride)
      for (const stride of [8, 16, 32]) {
        const clsKey = `cls_${stride}`;
        const objKey = `obj_${stride}`;
        const bboxKey = `bbox_${stride}`;
        const kpsKey = `kps_${stride}`;

        if (!results[clsKey] || !results[objKey] || !results[bboxKey]) {
          console.log(`Missing outputs for stride ${stride}`);
          continue;
        }

        const clsScores = results[clsKey].data as Float32Array;
        const objScores = results[objKey].data as Float32Array;
        const bboxes = results[bboxKey].data as Float32Array;
        const landmarks = results[kpsKey].data as Float32Array;

        const dims = results[clsKey].dims; // [batch, num_anchors, 1]
        const numAnchors = dims[1];

        // Generate anchor grid for this stride
        const gridHeight = Math.ceil(imgHeight / stride);
        const gridWidth = Math.ceil(imgWidth / stride);

        for (let i = 0; i < numAnchors; i++) {
          // YuNet: cls is already sigmoid, obj might be all zeros (unused)
          const cls = clsScores[i]; // Already in [0, 1] range

          // Check if obj scores are being used (non-zero)
          const objRaw = objScores[i];
          const score = objRaw === 0 ? cls : cls * (1 / (1 + Math.exp(-objRaw)));

          if (score > scoreThreshold) {
            // YuNet outputs: [dx, dy, dw, dh] relative to anchor point
            // dx, dy: offset from anchor center (normalized by stride)
            // dw, dh: log-encoded size (need exp())
            const bboxOffset = i * 4;
            const dx = bboxes[bboxOffset];
            const dy = bboxes[bboxOffset + 1];
            const dw = bboxes[bboxOffset + 2];
            const dh = bboxes[bboxOffset + 3];

            // Calculate anchor center
            const anchorY = Math.floor(i / gridWidth);
            const anchorX = i % gridWidth;
            const anchorCenterX = (anchorX + 0.5) * stride;
            const anchorCenterY = (anchorY + 0.5) * stride;

            // Decode center point (offset from anchor)
            const cx = anchorCenterX + dx * stride;
            const cy = anchorCenterY + dy * stride;

            // Decode size (exponential + base size of stride)
            const w = Math.exp(dw) * stride;
            const h = Math.exp(dh) * stride;

            // Convert from center coordinates to top-left coordinates
            const x1 = cx - w / 2;
            const y1 = cy - h / 2;

            // Filter: minimum face size (at least 40x40 pixels), within bounds
            const minFaceSize = 40;
            if (x1 >= 0 && y1 >= 0 && x1 + w <= imgWidth && y1 + h <= imgHeight &&
                w >= minFaceSize && h >= minFaceSize) {
              // Extract 5 landmarks (also relative to anchor, like bbox)
              const kpsOffset = i * 10;
              const landmarkPoints: Array<{ x: number; y: number }> = [];
              for (let k = 0; k < 5; k++) {
                const lx = anchorCenterX + landmarks[kpsOffset + k * 2] * stride;
                const ly = anchorCenterY + landmarks[kpsOffset + k * 2 + 1] * stride;
                landmarkPoints.push({ x: lx, y: ly });
              }

              detections.push({
                bbox: { x: x1, y: y1, width: w, height: h },
                confidence: score,
                landmarks: landmarkPoints,
              });

              if (detections.length <= 10) {
                console.log(`YuNet face ${detections.length}: stride=${stride}, center=[${cx.toFixed(1)}, ${cy.toFixed(1)}], bbox=[${x1.toFixed(1)}, ${y1.toFixed(1)}, ${w.toFixed(1)}, ${h.toFixed(1)}], score=${score.toFixed(3)}`);
              }
            }
          }
        }
      }

      console.log(`Found ${detections.length} faces with YuNet (before NMS)`);

      // Apply NMS to remove duplicates (0.3 = 30% overlap threshold, quite aggressive)
      const nmsDetections = this.applyNMS(detections, 0.3);
      console.log(`After NMS: ${nmsDetections.length} faces`);

      return nmsDetections;
    } catch (error) {
      console.error('Error parsing YuNet results:', error);
      return [];
    }
  }

  private parseInsightFaceResults(results: Record<string, Tensor>, imgWidth: number, imgHeight: number): DetectionResult[] {
    // InsightFace det_500m outputs:
    // Multiple scale predictions (stride 8, 16, 32)
    // Each scale has: scores, bboxes, landmarks

    const detections: DetectionResult[] = [];
    const scoreThreshold = 0.3; // Lowered threshold for testing

    try {
      // The outputs are in format: [score_8, bbox_8, kps_8, score_16, bbox_16, kps_16, score_32, bbox_32, kps_32]
      const outputKeys = Object.keys(results).sort();

      // Check actual score values for debugging
      const firstScores = results[outputKeys[0]].data as Float32Array;
      // Avoid spread operator for large arrays
      let maxRawScore = -Infinity, minRawScore = Infinity;
      for (let i = 0; i < firstScores.length; i++) {
        if (firstScores[i] > maxRawScore) maxRawScore = firstScores[i];
        if (firstScores[i] < minRawScore) minRawScore = firstScores[i];
      }
      const maxSigmoid = 1 / (1 + Math.exp(-maxRawScore));
      console.log(`Raw score range: ${minRawScore.toFixed(4)} to ${maxRawScore.toFixed(4)}`);
      console.log(`After sigmoid: max=${maxSigmoid.toFixed(4)}`);

      // Process each scale (8, 16, 32)
      for (let i = 0; i < outputKeys.length; i += 3) {
        if (i + 2 >= outputKeys.length) break;

        const scoreKey = outputKeys[i];
        const bboxKey = outputKeys[i + 1];
        const kpsKey = outputKeys[i + 2];

        const scores = results[scoreKey].data as Float32Array;
        const bboxes = results[bboxKey].data as Float32Array;
        const landmarks = results[kpsKey].data as Float32Array;

        const scoreShape = results[scoreKey].dims; // [num_anchors, 1]
        const numAnchors = scoreShape[0];

        console.log(`Processing scale ${i/3}: ${numAnchors} anchors`);

        // Iterate through anchors
        for (let j = 0; j < numAnchors; j++) {
          // Apply sigmoid to get proper probability
          const rawScore = scores[j];
          const score = 1 / (1 + Math.exp(-rawScore)); // sigmoid activation

          if (score > scoreThreshold) {
            // Extract bbox (x1, y1, x2, y2)
            const bboxOffset = j * 4;
            const x1 = bboxes[bboxOffset];
            const y1 = bboxes[bboxOffset + 1];
            const x2 = bboxes[bboxOffset + 2];
            const y2 = bboxes[bboxOffset + 3];

            // Extract landmarks (5 points, each with x,y)
            const kpsOffset = j * 10;
            const landmarkPoints: Array<{ x: number; y: number }> = [];
            for (let k = 0; k < 5; k++) {
              landmarkPoints.push({
                x: landmarks[kpsOffset + k * 2],
                y: landmarks[kpsOffset + k * 2 + 1],
              });
            }

            detections.push({
              bbox: {
                x: x1,
                y: y1,
                width: x2 - x1,
                height: y2 - y1,
              },
              confidence: score,
              landmarks: landmarkPoints,
            });

            console.log(`Detected face ${detections.length}: bbox=[${x1.toFixed(1)}, ${y1.toFixed(1)}, ${x2.toFixed(1)}, ${y2.toFixed(1)}], confidence=${score.toFixed(3)}`);
          }
        }
      }

      console.log(`Found ${detections.length} faces with confidence > ${scoreThreshold}`);
      return detections;

    } catch (error) {
      console.error('Error parsing detection results:', error);
      return [];
    }
  }

  private parseAgeGenderResults(results: Record<string, Tensor>): AgeGenderResult {
    // InsightFace Buffalo_L genderage.onnx output format:
    // - Indices 0-1: Gender logits [male_logit, female_logit]
    // - Index 2: Age value normalized 0-1 (multiply by 100 for years)
    const output = results['output'] || results[Object.keys(results)[0]];
    const data = output.data as Float32Array;

    if (data.length !== 3) {
      console.error(`Invalid genderage output: expected 3 values, got ${data.length}`);
      return {
        age: 0,
        gender: 'M',
        genderConfidence: 0,
      };
    }

    // Extract gender from logits (argmax of first 2 values)
    const maleLogit = data[0];
    const femaleLogit = data[1];
    const genderIdx = maleLogit > femaleLogit ? 0 : 1; // 0=Male, 1=Female
    const gender = genderIdx === 0 ? 'M' : 'F';

    // Apply softmax to get confidence
    const expMale = Math.exp(maleLogit);
    const expFemale = Math.exp(femaleLogit);
    const sumExp = expMale + expFemale;
    const maleProb = expMale / sumExp;
    const femaleProb = expFemale / sumExp;
    const genderConfidence = Math.max(maleProb, femaleProb);

    // Extract age (denormalize from 0-1 to 0-100)
    const age = Math.round(data[2] * 100);

    console.log(`Parsed: ${age}y, ${gender} (${(genderConfidence * 100).toFixed(1)}%)`);

    return {
      age,
      gender,
      genderConfidence,
    };
  }

  /**
   * Calculate cosine similarity between two face embeddings
   * Returns similarity score: 0.0 (different) to 1.0 (identical)
   * Typical threshold: > 0.4 = same person
   */
  compareFaces(embedding1: Float32Array, embedding2: Float32Array): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error(`Embedding dimension mismatch: ${embedding1.length} vs ${embedding2.length}`);
    }

    // Calculate cosine similarity
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    return similarity;
  }

  /**
   * Crop and align face from full image for recognition/age-gender
   * Returns normalized face patch of specified size
   */
  cropAlignFace(
    fullImageData: Float32Array,
    fullWidth: number,
    fullHeight: number,
    detection: DetectionResult,
    targetSize: number = 112,
  ): Float32Array {
    const faceData = new Float32Array(3 * targetSize * targetSize);

    // Get bbox with padding
    const bbox = detection.bbox;
    const padding = 0.3; // 30% padding around face
    const w = bbox.width;
    const h = bbox.height;
    const cx = bbox.x + w / 2;
    const cy = bbox.y + h / 2;
    const size = Math.max(w, h) * (1 + padding);

    const x1 = Math.max(0, Math.floor(cx - size / 2));
    const y1 = Math.max(0, Math.floor(cy - size / 2));
    const x2 = Math.min(fullWidth, Math.ceil(cx + size / 2));
    const y2 = Math.min(fullHeight, Math.ceil(cy + size / 2));

    const cropW = x2 - x1;
    const cropH = y2 - y1;

    // Simple bilinear resize from crop to 112x112
    for (let c = 0; c < 3; c++) {
      for (let y = 0; y < targetSize; y++) {
        for (let x = 0; x < targetSize; x++) {
          // Map target coords to source coords
          const srcX = x1 + (x / targetSize) * cropW;
          const srcY = y1 + (y / targetSize) * cropH;

          const x0 = Math.floor(srcX);
          const y0 = Math.floor(srcY);
          const x1_coord = Math.min(x0 + 1, fullWidth - 1);
          const y1_coord = Math.min(y0 + 1, fullHeight - 1);

          const dx = srcX - x0;
          const dy = srcY - y0;

          // Bilinear interpolation
          const v00 = fullImageData[c * fullWidth * fullHeight + y0 * fullWidth + x0];
          const v10 = fullImageData[c * fullWidth * fullHeight + y0 * fullWidth + x1_coord];
          const v01 = fullImageData[c * fullWidth * fullHeight + y1_coord * fullWidth + x0];
          const v11 = fullImageData[c * fullWidth * fullHeight + y1_coord * fullWidth + x1_coord];

          const value = v00 * (1 - dx) * (1 - dy) +
                       v10 * dx * (1 - dy) +
                       v01 * (1 - dx) * dy +
                       v11 * dx * dy;

          faceData[c * targetSize * targetSize + y * targetSize + x] = value;
        }
      }
    }

    return faceData;
  }

  /**
   * High-level method to detect and analyze faces from an image file
   * @param imagePath - Local file path to the image
   * @param maxDimension - Maximum dimension to resize the image (default: 2600)
   * @returns Detection results with age/gender analysis
   */
  async detectAndAnalyzeFaces(imagePath: string, maxDimension: number = 2600): Promise<{
    detections: Array<{
      bbox: { x: number; y: number; width: number; height: number };
      confidence: number;
      age?: number;
      gender?: string;
      genderConfidence?: number;
    }>;
  }> {
    if (!this.isInitialized) {
      throw new Error('FaceRecognitionService not initialized');
    }

    // Load and preprocess image using native ImageDecoder
    const ImageUtils = require('../utils/ImageUtils').default;
    const { imageData, width, height } = await ImageUtils.loadAndPreprocessImage(imagePath, maxDimension);

    // Detect faces
    const detections = await this.detectFaces(imageData, width, height);

    // Analyze each face for age/gender
    const results = [];
    for (const detection of detections) {
      const bbox = detection.bbox;

      // Crop and align face to 96x96 for age-gender estimation
      // Using the same method as FaceRecognitionTestScreen
      try {
        const faceCrop96 = this.cropAlignFace(imageData, width, height, detection, 96);
        const ageGender = await this.estimateAgeGender(faceCrop96, 96, 96);

        results.push({
          bbox: {
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
          },
          confidence: detection.confidence,
          age: ageGender.age,
          gender: ageGender.gender,
          genderConfidence: ageGender.genderConfidence,
        });
      } catch (error) {
        console.warn('[FaceRecognition] Failed to analyze face:', error);
        // Still include detection without age/gender
        results.push({
          bbox: {
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
          },
          confidence: detection.confidence,
        });
      }
    }

    return { detections: results };
  }

  async release(): Promise<void> {
    if (this.detectionSession) {
      await this.detectionSession.release();
      this.detectionSession = null;
    }
    if (this.recognitionSession) {
      await this.recognitionSession.release();
      this.recognitionSession = null;
    }
    if (this.ageGenderSession) {
      await this.ageGenderSession.release();
      this.ageGenderSession = null;
    }
    this.isInitialized = false;
    console.log('FaceRecognitionService released');
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  // NMS (Non-Maximum Suppression) to remove duplicate detections
  private applyNMS(detections: DetectionResult[], iouThreshold: number = 0.4): DetectionResult[] {
    if (detections.length === 0) return [];

    // Sort by confidence (highest first)
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
    const keep: DetectionResult[] = [];

    while (sorted.length > 0) {
      const current = sorted.shift()!;
      keep.push(current);

      // Remove overlapping boxes
      const remaining: DetectionResult[] = [];
      for (const detection of sorted) {
        const iou = this.calculateIoU(current.bbox, detection.bbox);
        if (iou < iouThreshold) {
          remaining.push(detection);
        }
      }
      sorted.length = 0;
      sorted.push(...remaining);
    }

    return keep;
  }

  // Calculate Intersection over Union
  private calculateIoU(box1: { x: number; y: number; width: number; height: number },
                       box2: { x: number; y: number; width: number; height: number }): number {
    const x1 = Math.max(box1.x, box2.x);
    const y1 = Math.max(box1.y, box2.y);
    const x2 = Math.min(box1.x + box1.width, box2.x + box2.width);
    const y2 = Math.min(box1.y + box1.height, box2.y + box2.height);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const area1 = box1.width * box1.height;
    const area2 = box2.width * box2.height;
    const union = area1 + area2 - intersection;

    return intersection / union;
  }

  // Helper method to compute cosine similarity between two embeddings
  static cosineSimilarity(embedding1: Float32Array, embedding2: Float32Array): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embeddings must have the same length');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }
}
