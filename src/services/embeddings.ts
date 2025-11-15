// Embeddings service for generating vector embeddings
// Uses OpenAI API for production, falls back to mock for testing

import OpenAI from "openai";
import crypto from "crypto";

export interface EmbeddingConfig {
  provider: 'openai' | 'mock';
  apiKey?: string;
  model?: string;
  enabled?: boolean;
}

export class EmbeddingsService {
  private openai: OpenAI | null = null;
  private config: EmbeddingConfig;
  private readonly defaultModel = "text-embedding-3-small";

  constructor(config?: EmbeddingConfig) {
    // Auto-detect from environment if not provided
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    const enabled = config?.enabled !== false; // Default to true

    this.config = {
      provider: apiKey && enabled ? 'openai' : 'mock',
      apiKey: apiKey,
      model: config?.model || this.defaultModel,
      enabled: enabled
    };

    // Initialize OpenAI client if API key is available
    if (this.config.provider === 'openai' && apiKey) {
      this.openai = new OpenAI({ apiKey });
      console.log(`✓ Embeddings service initialized with OpenAI (${this.config.model})`);
    } else {
      console.log('⚠️  Embeddings service using mock embeddings (no OpenAI API key)');
    }
  }

  /**
   * Generate embedding for text
   * @param text - Text to generate embedding for
   * @returns 1536-dimensional embedding vector
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.config.enabled) {
      throw new Error('Embeddings are disabled');
    }

    // Use OpenAI if available
    if (this.config.provider === 'openai' && this.openai) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.config.model!,
          input: text,
          encoding_format: "float"
        });

        if (!response.data || response.data.length === 0) {
          throw new Error('No embedding returned from OpenAI');
        }

        return response.data[0].embedding;
      } catch (error) {
        console.error('OpenAI embedding error:', error);
        // Fall back to mock embeddings on error
        console.warn('Falling back to mock embeddings due to OpenAI error');
        return this.generateMockEmbedding(text);
      }
    }

    // Use mock embeddings
    return this.generateMockEmbedding(text);
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * @param texts - Array of texts
   * @returns Array of embedding vectors
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.config.enabled) {
      throw new Error('Embeddings are disabled');
    }

    // Use OpenAI batch if available
    if (this.config.provider === 'openai' && this.openai) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.config.model!,
          input: texts,
          encoding_format: "float"
        });

        if (!response.data || response.data.length === 0) {
          throw new Error('No embeddings returned from OpenAI');
        }

        return response.data.map(d => d.embedding);
      } catch (error) {
        console.error('OpenAI batch embedding error:', error);
        // Fall back to mock embeddings
        console.warn('Falling back to mock embeddings due to OpenAI error');
        return texts.map(text => this.generateMockEmbedding(text));
      }
    }

    // Use mock embeddings
    return texts.map(text => this.generateMockEmbedding(text));
  }

  /**
   * Generate deterministic mock embedding for testing
   * @param text - Text to generate embedding for
   * @returns 1536-dimensional mock embedding
   */
  generateMockEmbedding(text: string): number[] {
    const hash = crypto.createHash('sha256').update(text).digest();
    const embedding: number[] = [];

    for (let i = 0; i < 1536; i++) {
      const byteIndex = i % hash.length;
      embedding.push((hash[byteIndex] / 255) * 2 - 1); // Normalize to [-1, 1]
    }

    return embedding;
  }

  /**
   * Check if service is using real OpenAI embeddings
   */
  isUsingOpenAI(): boolean {
    return this.config.provider === 'openai' && this.openai !== null;
  }

  /**
   * Get current configuration
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  /**
   * Get embedding dimensions (always 1536 for OpenAI text-embedding-3-small)
   */
  getDimensions(): number {
    return 1536;
  }
}

/**
 * Create embeddings service instance
 * Auto-detects OpenAI API key from environment
 */
export function createEmbeddingsService(config?: EmbeddingConfig): EmbeddingsService {
  return new EmbeddingsService(config);
}
