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
      _retryCount?: number; // Internal parameter for retry tracking
    },
  ): Promise<{ tokensGenerated: number; durationMs: number }> {
    if (!this.state.context) {
      throw new Error('Model not loaded. Call load() first.');
    }

    const retryCount = params?._retryCount ?? 0;
    const MAX_RETRIES = 2; // Try up to 3 times total (1 original + 2 retries)

    const startTime = Date.now();
    let tokensGenerated = 0;
    let fullText = '';
    let callbackFired = false;
    let lastTokenTime = Date.now();
    let insideThinkBlock = false;
    let thinkBuffer = '';
    let tokensEmittedToUI = 0;
    let thinkingOnlyTokens = 0;
    let thinkingStartTime = 0;
    const MAX_THINKING_TIME_MS = 5000; // Force answer after 5 seconds of thinking

    const formattedPrompt = this.formatPrompt(prompt);

    console.log(`[LlamaEngine] 🚀 Starting completion - prompt length: ${formattedPrompt.length}`);
    console.log(`[LlamaEngine] 📝 User query: "${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}}"`);

    // CRITICAL: Qwen 3.5's thinking mode is triggered by outputting <think> tag
    // We use multiple strategies to prevent this:
    // 1. Lower temperature for more deterministic output
    // 2. Stop sequences to halt if thinking starts
    // 3. Few-shot prompting to demonstrate non-thinking responses
    // 4. Real-time detection and filtering in callback
    const result = await this.state.context.completion(
      {
        prompt: formattedPrompt,
        n_predict: params?.maxTokens ?? 2048,
        // Balanced parameters: creative but not random
        temperature: params?.temperature ?? 0.8,
        top_p: params?.topP ?? 0.95,
        top_k: 40,
        repeat_penalty: 1.05,
        // Stop sequences - note these may not catch <think> if tokenized as multiple tokens
        stop: params?.stop ?? ['<|endoftext|>', '<|im_end|>', '\n\nUser:', '\n\nHuman:'],
        emit_partial_completion: true,
      },
      (partial: { token: string }) => {
        callbackFired = true;
        tokensGenerated++;
        fullText += partial.token;
        lastTokenTime = Date.now();

        // ARCHITECTURAL FEATURE: Qwen 3.5 Thinking Mode Filter
        // Qwen 3.5 uses <think>...</think> tags for internal reasoning
        // Per official docs, this should only activate with enable_thinking: True
        // However, the model sometimes enters this mode anyway due to training
        // This filter implements the proper handling as per Alibaba Cloud's design:
        // - Filter out thinking content (not meant for end users)
        // - Extract and present only the final answer

        thinkBuffer += partial.token;

        // Detect entering thinking mode
        if (!insideThinkBlock && thinkBuffer.includes('<think>')) {
          insideThinkBlock = true;
          thinkingStartTime = Date.now();
          console.log(`[LlamaEngine] 🧠 Qwen entering reasoning mode (token ${tokensGenerated})`);
          thinkBuffer = thinkBuffer.split('<think>')[1] || '';
        }

        // Detect exiting thinking mode - this is when the actual answer begins
        if (insideThinkBlock && thinkBuffer.includes('</think>')) {
          insideThinkBlock = false;
          console.log(`[LlamaEngine] ✅ Reasoning complete, extracting answer (token ${tokensGenerated})`);
          // Extract and emit content after </think>
          const answerPart = thinkBuffer.split('</think>')[1];
          thinkBuffer = answerPart || '';
          if (answerPart && answerPart.trim()) {
            onToken(answerPart);
            tokensEmittedToUI++;
          }
          return;
        }

        // Maintain sliding window buffer for tag detection
        if (thinkBuffer.length > 50) {
          thinkBuffer = thinkBuffer.slice(-50);
        }

        // Skip tokens if inside think block (internal reasoning)
        if (insideThinkBlock) {
          thinkingOnlyTokens++;

          // CRITICAL FIX: Stop thinking if it takes too long
          const thinkingDuration = Date.now() - thinkingStartTime;
          if (thinkingDuration > MAX_THINKING_TIME_MS) {
            // console.error(`[LlamaEngine] ⏱️ Thinking timeout after ${thinkingDuration}ms (${thinkingOnlyTokens} tokens) - forcing stop`);
            try {
              this.state.context?.stopCompletion();
            } catch (e) {
              console.error(`[LlamaEngine] Error stopping completion:`, e);
            }
            insideThinkBlock = false; // Exit thinking mode
            return;
          }

          // Don't emit thinking tokens, but let the model continue
          // The answer comes AFTER </think>
          return;
        }

        // Skip if this specific token contains the think tags
        if (partial.token.includes('<think>') || partial.token.includes('</think>')) {
          return;
        }

        // Always emit token to UI
        try {
          onToken(partial.token);
          tokensEmittedToUI++;
        } catch (e) {
          console.error(`[LlamaEngine] ❌ Error in onToken callback:`, e);
        }

        // Log first few tokens for debugging
        if (tokensGenerated <= 5) {
          console.log(`[LlamaEngine] Token ${tokensGenerated}: "${partial.token}"`);
        }

        // Log every 50 tokens
        if (tokensGenerated % 50 === 0) {
          const elapsed = Date.now() - startTime;
          const tps = (tokensGenerated / elapsed) * 1000;
          console.log(`[LlamaEngine] Progress: ${tokensGenerated} tokens, ${tps.toFixed(1)} t/s`);
        }
      },
    );

    const durationMs = Date.now() - startTime;

    console.log(`[LlamaEngine] ✅ Completion finished:`);
    console.log(`  - Total tokens: ${tokensGenerated}`);
    console.log(`  - Answer tokens: ${tokensEmittedToUI}`);
    console.log(`  - Reasoning tokens: ${thinkingOnlyTokens}`);
    console.log(`  - Duration: ${durationMs}ms`);
    console.log(`  - Quality: ${insideThinkBlock ? 'REASONING_INCOMPLETE' : tokensEmittedToUI > 0 ? 'ANSWER_PROVIDED' : 'NO_OUTPUT'}`);

    // POST-PROCESSING: Handle thinking-only responses
    if (tokensEmittedToUI === 0) {
      // console.warn(`[LlamaEngine] ⚠️ Model stuck in thinking mode (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);

      // AUTOMATIC RETRY: If model only gave thinking, retry with different parameters
      if (retryCount < MAX_RETRIES) {
        console.log(`[LlamaEngine] 🔄 Retrying with adjusted parameters to force direct answer...`);

        // Retry with higher temperature and different sampling to break the thinking loop
        return await this.complete(prompt, onToken, {
          ...params,
          temperature: 0.7 + (retryCount * 0.15), // Increase temperature each retry
          topP: 0.9,
          _retryCount: retryCount + 1,
        });
      }

      // If all retries exhausted, try to extract something useful
      console.error(`[LlamaEngine] ❌ Max retries reached, attempting to extract answer from thinking`);

      // Try to extract content after </think>
      if (fullText.includes('</think>')) {
        const parts = fullText.split('</think>');
        const answer = parts[parts.length - 1].trim();

        if (answer && answer.length > 15) {
          console.log(`[LlamaEngine] ✅ Extracted answer after </think> (${answer.length} chars)`);
          onToken('\n' + answer);
          return { tokensGenerated: Math.ceil(answer.length / 4), durationMs };
        }
      }

      // Last resort: error message
      console.error(`[LlamaEngine] ❌ Unable to get valid response after ${retryCount + 1} attempts`);
      const errorMsg = "i apologize, but i'm having trouble generating a clear response. could you please rephrase your question or try asking it differently?";
      onToken(errorMsg);
      return { tokensGenerated: 1, durationMs };
    }

    // If callback wasn't fired but result has text, handle it
    if (!callbackFired && result && typeof result === 'object') {
      const resultText = (result as any).text || (result as any).completion || '';
      console.log(`[LlamaEngine] ⚠️ Callback never fired! Checking result object...`);
      console.log(`  - Result keys:`, Object.keys(result));
      console.log(`  - Result text length: ${resultText.length}`);

      if (resultText) {
        console.log(`[LlamaEngine] 🔧 Fallback: Emitting full text at once`);
        // Emit the full text at once
        onToken(resultText);
        // Estimate token count (rough approximation: 1 token ≈ 4 chars)
        tokensGenerated = Math.ceil(resultText.length / 4);
      } else {
        console.error(`[LlamaEngine] ❌ CRITICAL: No tokens via callback AND no text in result!`);
        console.error(`  - Result object:`, JSON.stringify(result, null, 2));
      }
    } else if (tokensGenerated === 0) {
      console.error(`[LlamaEngine] ❌ CRITICAL: Callback fired but zero tokens generated!`);
    }

    return { tokensGenerated, durationMs };
  }

  // ── Chat prompt format (Qwen / ChatML) ──────────────────────────────────────
  private formatPrompt(userMessage: string): string {
    // Official Qwen 3.5 ChatML format
    // Note: Model may enter thinking mode despite this being non-thinking prompt
    // The LlamaEngine properly handles <think> tags by filtering them out
    return (
      `<|im_start|>system\n` +
      `You are Qwen, created by Alibaba Cloud. You are a helpful assistant.\n` +
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