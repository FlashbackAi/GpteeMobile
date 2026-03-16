/**
 * LlamaEngine.ts
 * Wraps llama.rn for on-device inference.
 *
 * Setup:
 *   npm install llama.rn
 *   cd ios && pod install
 *
 * Model: download a GGUF model and place it in:
 *   Android: app/src/main/assets/models/model.gguf
 *   iOS:     <project>/models/model.gguf  (add to Xcode target)
 *
 */

import { Platform } from 'react-native';

// Conditionally import llama.rn to avoid crash if not linked
let initLlama: any;
let LlamaContext: any;
try {
  const llamaRn = require('llama.rn');
  initLlama = llamaRn.initLlama;
  LlamaContext = llamaRn.LlamaContext;
} catch (e) {
  console.warn('llama.rn not available:', e);
  initLlama = null;
  LlamaContext = null;
}

export type TokenCallback = (token: string) => void;

interface LlamaEngineState {
  context: LlamaContext | null;
  modelName: string;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

class LlamaEngine {
  private state: LlamaEngineState = {
    context: null,
    modelName: '',
    loading: false,
    loaded: false,
    error: null,
  };

  isLoaded(): boolean {
    return this.state.loaded;
  }

  getModelName(): string {
    return this.state.modelName;
  }

  isLoading(): boolean {
    return this.state.loading;
  }

  getError(): string | null {
    return this.state.error;
  }

  // ── Load model ──────────────────────────────────────────────────────────────
  async load(
    modelPath: string,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    if (this.state.loaded) return;
    if (this.state.loading) return;

    this.state.loading = true;
    this.state.error = null;

    try {

      this.state.context = await initLlama({
        model: modelPath,
        n_ctx: 2048,           // Context window size
        n_batch: 512,          // Batch size for prompt processing
        n_threads: 4,          // CPU threads
        use_mlock: false,      // Don't lock memory (mobile-friendly)
        use_mmap: true,        // Memory map the model file
        embedding: false,      // We're doing text generation, not embeddings
      });

      // Extract filename from path
      const fileName = modelPath.split('/').pop() || 'unknown';
      this.state.modelName = fileName;
      this.state.loaded = true;
      this.state.loading = false;
    } catch (e: any) {
      this.state.loading = false;
      this.state.error = e?.message ?? 'Failed to load model';
      console.error('[LlamaEngine] ❌ Load error:', this.state.error);
      console.error('[LlamaEngine] Error details:', JSON.stringify(e, null, 2));
      console.error('[LlamaEngine] Model path:', modelPath);

      // Check if it's a file access issue
      const RNFS = require('react-native-fs');
      const exists = await RNFS.exists(modelPath);
      console.error('[LlamaEngine] File exists:', exists);
      if (exists) {
        const stat = await RNFS.stat(modelPath);
        console.error('[LlamaEngine] File size:', stat.size);
      }

      throw e;
    }
  }

  // ── Run inference (streaming) ───────────────────────────────────────────────
  async complete(
    prompt: string,
    onToken: TokenCallback,
    params?: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      stop?: string[];
    },
  ): Promise<{ tokensGenerated: number; durationMs: number }> {
    if (!this.state.context) {
      throw new Error('Model not loaded. Call load() first.');
    }

    const startTime = Date.now();
    let tokensGenerated = 0;
    let fullText = '';

    const formattedPrompt = this.formatPrompt(prompt);

    const result = await this.state.context.completion(
      {
        prompt: formattedPrompt,
        n_predict: params?.maxTokens ?? 2048,
        temperature: params?.temperature ?? 0.7,
        top_p: params?.topP ?? 0.9,
        stop: params?.stop ?? ['<|endoftext|>', '<|im_end|>', '\n\nUser:', '\n\nHuman:'],
        emit_partial_completion: true,
      },
      (partial: { token: string }) => {
        tokensGenerated++;
        fullText += partial.token;
        onToken(partial.token);
        if (tokensGenerated <= 3) {
          // console.log(`[LlamaEngine] Token ${tokensGenerated}: "${partial.token}"`);
        }
      },
    );

    const durationMs = Date.now() - startTime;

    // Debug: check what result contains
    // console.log(`[LlamaEngine] Result object:`, JSON.stringify(result, null, 2));
    // console.log(`[LlamaEngine] Callback fired ${tokensGenerated} times`);
    // console.log(`[LlamaEngine] Full text length: ${fullText.length}`);

    // If callback wasn't fired but result has text, handle it
    if (tokensGenerated === 0 && result && typeof result === 'object') {
      const resultText = (result as any).text || (result as any).completion || '';
      if (resultText) {
        // console.log(`[LlamaEngine] ⚠️ No callbacks fired, but result has text: ${resultText.length} chars`);
        // Emit the full text at once
        onToken(resultText);
        // Estimate token count (rough approximation: 1 token ≈ 4 chars)
        tokensGenerated = Math.ceil(resultText.length / 4);
      }
    }

    return { tokensGenerated, durationMs };
  }

  // ── Chat prompt format (Qwen / ChatML) ──────────────────────────────────────
  private formatPrompt(userMessage: string): string {
    return (
      `<|im_start|>system\n` +
      `You are GPTee, a helpful AI assistant running privately on this device.\n` +
      `<|im_end|>\n` +
      `<|im_start|>user\n` +
      `${userMessage}\n` +
      `<|im_end|>\n` +
      `<|im_start|>assistant\n`
    );
  }

  // ── Stop generation ─────────────────────────────────────────────────────────
  async stop(): Promise<void> {
    if (this.state.context) {
      await this.state.context.stopCompletion();
    }
  }

  // ── Unload model ────────────────────────────────────────────────────────────
  async unload(): Promise<void> {
    if (this.state.context) {
      await this.state.context.release();
      this.state.context = null;
      this.state.loaded = false;
      this.state.modelName = '';
    }
  }

  // ── Alias for compatibility ─────────────────────────────────────────────────
  async loadModel(modelPath: string, onProgress?: (progress: number) => void): Promise<void> {
    return this.load(modelPath, onProgress);
  }
}

export const llamaEngine = new LlamaEngine();