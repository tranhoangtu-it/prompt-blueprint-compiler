export interface CompileOptions {
  strict?: boolean;
  trimWhitespace?: boolean;
  model?: string;
}

export interface CompileResult {
  prompt: string;
  missingVariables: string[];
  tokens: number;
  estimatedInputCostUsd: number;
}

export interface ChatMessage {
  role: string;
  content: unknown;
}

export interface TokenEstimateOptions {
  model?: "gpt-4o" | "o3-mini" | "claude-sonnet-4" | "gemini-2.5-pro" | "deepseek-v3" | string;
  expectedOutputTokens?: number;
}

export interface TokenEstimateResult {
  model: string;
  tokens: number;
  contextWindow: number;
  contextUtilization: number;
  estimatedInputCostUsd: number;
  estimatedOutputCostUsd: number;
  estimatedTotalCostUsd: number;
}

export interface ValidationResult<T = unknown> {
  valid: boolean;
  data: T | null;
  errors: string[];
}

export function extractVariables(template: string): string[];
export function compileBlueprint(
  template: string,
  variables?: Record<string, unknown>,
  options?: CompileOptions,
): CompileResult;
export function wrapUntrustedInput(tagName: string, untrustedText: string): string;
export function estimateTokens(
  input: string | ChatMessage[],
  options?: TokenEstimateOptions,
): TokenEstimateResult;
export function extractJsonBlock(rawText: string): unknown;
export function validateAgentOutput<T = unknown>(
  dataOrRawText: unknown,
  schema: Record<string, unknown>,
): ValidationResult<T>;
export const MODEL_PRICING_PER_1M: Record<
  string,
  { input: number; output: number; contextWindow: number }
>;
