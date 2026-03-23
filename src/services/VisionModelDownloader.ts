// Vision model downloader - manages ONNX model downloads

import { VISION_MODELS, VisionModelInfo } from './FaceRecognitionModels';

// Conditionally import RNFS
let RNFS: any;
try {
  RNFS = require('react-native-fs');
} catch (e) {
  console.warn('react-native-fs not available:', e);
  RNFS = null;
}

export interface DownloadProgress {
  bytesWritten: number;
  contentLength: number;
  progress: number; // 0-100
}

export class VisionModelDownloader {
  private static instance: VisionModelDownloader;
  private modelDir: string;
  private downloadJobs: Map<string, number> = new Map(); // filename -> jobId

  private constructor() {
    // Store models alongside LLM models
    this.modelDir = `${RNFS.DocumentDirectoryPath}/models/vision`;
  }

  static getInstance(): VisionModelDownloader {
    if (!VisionModelDownloader.instance) {
      VisionModelDownloader.instance = new VisionModelDownloader();
    }
    return VisionModelDownloader.instance;
  }

  getModelDirectory(): string {
    return this.modelDir;
  }

  async ensureModelDirectory(): Promise<void> {
    if (!RNFS) throw new Error('react-native-fs not available');
    const exists = await RNFS.exists(this.modelDir);
    if (!exists) {
      await RNFS.mkdir(this.modelDir);
    }
  }

  getModelPath(model: VisionModelInfo | string): string {
    const filename = typeof model === 'string' ? model : model.filename;
    return `${this.modelDir}/${filename}`;
  }

  async isModelDownloaded(model: VisionModelInfo | string): Promise<boolean> {
    const path = this.getModelPath(model);
    return await RNFS.exists(path);
  }

  async getDownloadedModelSize(model: VisionModelInfo | string): Promise<number> {
    try {
      const path = this.getModelPath(model);
      const stat = await RNFS.stat(path);
      return parseInt(stat.size, 10);
    } catch (error) {
      return 0;
    }
  }

  async downloadModel(
    model: VisionModelInfo,
    onProgress: (progress: DownloadProgress) => void,
  ): Promise<string> {
    await this.ensureModelDirectory();

    const downloadDest = this.getModelPath(model);

    // Check if already exists
    if (await RNFS.exists(downloadDest)) {
      const stat = await RNFS.stat(downloadDest);
      const size = parseInt(stat.size, 10);
      // If file exists and has a reasonable size, assume it's complete
      if (size > model.size * 0.9) {
        // Allow 10% variance
        onProgress({
          bytesWritten: size,
          contentLength: size,
          progress: 100,
        });
        return downloadDest;
      } else {
        // Partial or corrupted download, delete and restart
        await RNFS.unlink(downloadDest);
      }
    }

    return new Promise<string>((resolve, reject) => {
      const download = RNFS.downloadFile({
        fromUrl: model.url,
        toFile: downloadDest,
        background: true,
        discretionary: true,
        cacheable: false,
        progress: (res: any) => {
          const progress: DownloadProgress = {
            bytesWritten: res.bytesWritten,
            contentLength: res.contentLength,
            progress: (res.bytesWritten / res.contentLength) * 100,
          };
          onProgress(progress);
        },
        progressInterval: 500,
      });

      this.downloadJobs.set(model.filename, download.jobId);

      download.promise
        .then((result: any) => {
          this.downloadJobs.delete(model.filename);
          if (result.statusCode === 200) {
            resolve(downloadDest);
          } else {
            reject(
              new Error(`Download failed with status ${result.statusCode}`),
            );
          }
        })
        .catch((error: any) => {
          this.downloadJobs.delete(model.filename);
          reject(error);
        });
    });
  }

  async cancelDownload(model: VisionModelInfo): Promise<void> {
    const jobId = this.downloadJobs.get(model.filename);
    if (jobId !== undefined) {
      RNFS.stopDownload(jobId);
      this.downloadJobs.delete(model.filename);
    }
  }

  async deleteModel(model: VisionModelInfo | string): Promise<void> {
    const path = this.getModelPath(model);
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  }

  async downloadAllModels(
    onProgress: (modelName: string, progress: DownloadProgress) => void,
  ): Promise<void> {
    for (const model of VISION_MODELS) {
      console.log(`Downloading ${model.name}...`);
      await this.downloadModel(model, (progress) => {
        onProgress(model.name, progress);
      });
    }
  }

  async areAllModelsDownloaded(): Promise<boolean> {
    for (const model of VISION_MODELS) {
      if (!(await this.isModelDownloaded(model))) {
        return false;
      }
    }
    return true;
  }

  async listDownloadedModels(): Promise<string[]> {
    await this.ensureModelDirectory();
    const files = await RNFS.readDir(this.modelDir);
    return files.filter((f: any) => f.name.endsWith('.onnx')).map((f: any) => f.name);
  }
}
