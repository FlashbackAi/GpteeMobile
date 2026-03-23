// Face recognition model definitions for InsightFace

export interface VisionModelInfo {
  name: string;
  url: string;
  filename: string;
  size: number; // bytes
  description: string;
  type: 'detection' | 'recognition' | 'age-gender';
}

// Complete InsightFace buffalo_l model pack
// Hosted on FlashbackLabsInc/MachineVisionService Hugging Face
// Production-ready face analysis suite

export const VISION_MODELS: VisionModelInfo[] = [
  // === DETECTION - RetinaFace MobileNetV2 for better diversity ===
  {
    name: 'RetinaFace MobileNetV2',
    type: 'detection',
    url: 'https://github.com/yakhyo/retinaface-pytorch/releases/download/v0.0.1/retinaface_mv2.onnx',
    filename: 'retinaface_mv2.onnx',
    size: 11_900_000, // ~12 MB
    description: 'RetinaFace MobileNetV2 - High accuracy (86.6% hard cases), better diversity performance',
  },
  // === RECOGNITION - Disabled for Worker Mode ===
  // {
  //   name: 'Recognition (AntelopeV2 glintr100)',
  //   type: 'recognition',
  //   url: 'https://huggingface.co/immich-app/antelopev2/resolve/main/recognition/model.onnx',
  //   filename: 'glintr100.onnx',
  //   size: 261_000_000, // ~261 MB
  //   description: 'AntelopeV2 ResNet100@Glint360K - Better recognition accuracy (512-d embeddings)',
  // },
  // === AGE & GENDER - InsightFace Buffalo_L (Official) ===
  {
    name: 'Age & Gender (Buffalo_L)',
    type: 'age-gender',
    url: 'https://huggingface.co/public-data/insightface/resolve/main/models/buffalo_l/genderage.onnx',
    filename: 'genderage.onnx',
    size: 1_320_000, // ~1.32 MB
    description: 'InsightFace Buffalo_L - Age and gender estimation (96x96 input)',
  },
];

// Production model combination
export const MODEL_PRESETS = {
  production: ['det_10g.onnx', 'w600k_r50.onnx', 'genderage.onnx'],
};

export interface DetectionResult {
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
  landmarks: Array<{ x: number; y: number }>; // 5 facial landmarks
}

export interface RecognitionResult {
  embedding: Float32Array; // 512-dimensional embedding
}

export interface AgeGenderResult {
  age: number;
  gender: 'M' | 'F';
  genderConfidence: number;
}
