// Conditionally import RNFS to avoid crash if not linked
let RNFS: any;
try {
  RNFS = require('react-native-fs');
} catch (e) {
  console.warn('react-native-fs not available:', e);
  RNFS = null;
}

export interface ModelDownloadProgress {
  bytesWritten: number;
  contentLength: number;
  progress: number; // 0-100
}

export interface ModelInfo {
  name: string;
  url: string;
  filename?: string; // optional - will be extracted from URL if not provided
  size?: number; // bytes - optional, determined from download
  description: string;
}

// Helper function to extract filename from URL
function getFilenameFromUrl(url: string): string {
  const parts = url.split('/');
  const lastPart = parts[parts.length - 1];
  // Remove query params if present
  return lastPart.split('?')[0];
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    name: 'Qwen3.5-0.8B-Q8',
    url: 'https://huggingface.co/lmstudio-community/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q8_0.gguf',
    description: 'Optimized for mobile inference',
  },
];

export class ModelDownloadManager {
  private static instance: ModelDownloadManager;
  private downloadJobId: number | null = null;
  private modelDir: string;

  private constructor() {
    // Store models in Android standard external cache directory
    // Android: /storage/emulated/0/Android/data/com.gptee/cache/models
    this.modelDir = `${RNFS.DocumentDirectoryPath}/models`;
    // This follows Android best practices for large downloadable files
    // this.modelDir = `${RNFS.ExternalCacheDirectoryPath}/models`;
  }

  getModelDirectory(): string {
    return this.modelDir;
  }

  static getInstance(): ModelDownloadManager {
    if (!ModelDownloadManager.instance) {
      ModelDownloadManager.instance = new ModelDownloadManager();
    }
    return ModelDownloadManager.instance;
  }

  async ensureModelDirectory(): Promise<void> {
    if (!RNFS) throw new Error('react-native-fs not available');
    const exists = await RNFS.exists(this.modelDir);
    if (!exists) {
      await RNFS.mkdir(this.modelDir);
    }
  }

  getModelFilename(model: ModelInfo): string {
    return model.filename || getFilenameFromUrl(model.url);
  }

  getModelPath(modelOrFilename: ModelInfo | string): string {
    const filename = typeof modelOrFilename === 'string'
      ? modelOrFilename
      : this.getModelFilename(modelOrFilename);
    return `${this.modelDir}/${filename}`;
  }

  async isModelDownloaded(modelOrFilename: ModelInfo | string): Promise<boolean> {
    const path = this.getModelPath(modelOrFilename);
    return await RNFS.exists(path);
  }

  async getDownloadedModelSize(modelOrFilename: ModelInfo | string): Promise<number> {
    try {
      const path = this.getModelPath(modelOrFilename);
      const stat = await RNFS.stat(path);
      return parseInt(stat.size, 10);
    } catch (error) {
      return 0;
    }
  }

  async downloadModel(
    model: ModelInfo,
    onProgress: (progress: ModelDownloadProgress) => void,
  ): Promise<string> {
    await this.ensureModelDirectory();

    const downloadDest = this.getModelPath(model);

    // Check if already exists
    if (await RNFS.exists(downloadDest)) {
      const stat = await RNFS.stat(downloadDest);
      const size = parseInt(stat.size, 10);
      // If file exists and has a reasonable size, assume it's complete
      if (size > 100000000) {
        // > 100MB indicates a valid model
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
        progress: (res) => {
          const progress: ModelDownloadProgress = {
            bytesWritten: res.bytesWritten,
            contentLength: res.contentLength,
            progress: (res.bytesWritten / res.contentLength) * 100,
          };
          onProgress(progress);
        },
        progressInterval: 500, // Update every 500ms
      });

      this.downloadJobId = download.jobId;

      download.promise
        .then((result) => {
          this.downloadJobId = null;
          if (result.statusCode === 200) {
            resolve(downloadDest);
          } else {
            reject(
              new Error(`Download failed with status ${result.statusCode}`),
            );
          }
        })
        .catch((error) => {
          this.downloadJobId = null;
          reject(error);
        });
    });
  }

  async cancelDownload(): Promise<void> {
    if (this.downloadJobId !== null) {
      RNFS.stopDownload(this.downloadJobId);
      this.downloadJobId = null;
    }
  }

  async deleteModel(modelOrFilename: ModelInfo | string): Promise<void> {
    const path = this.getModelPath(modelOrFilename);
    if (await RNFS.exists(path)) {
      await RNFS.unlink(path);
    }
  }

  async getAvailableSpace(): Promise<number> {
    const freeSpace = await RNFS.getFSInfo();
    return freeSpace.freeSpace;
  }

  async listDownloadedModels(): Promise<string[]> {
    await this.ensureModelDirectory();
    const files = await RNFS.readDir(this.modelDir);
    return files.filter((f) => f.name.endsWith('.gguf')).map((f) => f.name);
  }
}
