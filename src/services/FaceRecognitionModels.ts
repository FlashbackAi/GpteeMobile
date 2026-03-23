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
  // {
  //   name: 'Recognition (w600k_r50)',
  //   type: 'recognition',
  //   url: 'https://huggingface.co/FlashbackLabsInc/MachineVisionService/resolve/main/w600k_r50.onnx',
  //   filename: 'w600k_r50.onnx',
  //   size: 166_000_000,
  //   description: 'ArcFace ResNet50 - Face recognition',
  // },
  // {
  //   name: 'Age & Gender',
  //   type: 'age-gender',
  //   url: 'https://huggingface.co/FlashbackLabsInc/MachineVisionService/resolve/main/genderage.onnx',
  //   filename: 'genderage.onnx',
  //   size: 1_300_000,
  //   description: 'Age and gender estimation',
  // },
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
