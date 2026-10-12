import type { Advice } from "./advice.ts";

export type Usage = {
  input_tokens: number;
  output_tokens: number;
};

export type ProviderRequest = {
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  schema: unknown;
  timeoutMs: number;
};

export type ProviderResult = {
  attempted: boolean;
  status: "ok" | "unstructured" | "failed";
  errorKind?: string;
  message?: string;
  advice: Advice | null;
  rawText: string | null;
  reportedModelId: string | null;
  usage: Usage | null;
  costUsd: number | null;
  latencyMs: number | null;
};

export interface Provider {
  consult(request: ProviderRequest): Promise<ProviderResult>;
}
