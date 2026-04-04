import OpenAI from 'openai';
import { env } from '../../config/env.js';
import { ApiError } from '../../common/api-error.js';
import { buildEvaluationPrompt, buildInterviewerPrompt } from './prompts.js';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export interface AiInterviewerReply {
  nextQuestion: string;
  followUpHint: string;
  communicationNote: string;
}

export interface AiEvaluationReport {
  feedbackSummary: string;
  solutionOverview: string;
  recommendations: string[];
  scores: {
    accuracy: number;
    efficiency: number;
    communication: number;
    problemSolving: number;
  };
}

async function jsonCompletion<T>(prompt: string): Promise<T> {
  try {
    const response = await client.responses.create({
      model: env.OPENAI_MODEL,
      input: prompt,
      temperature: 0.4,
      text: { format: { type: 'json_object' } }
    });

    const text = response.output_text;
    return JSON.parse(text) as T;
  } catch (error) {
    throw new ApiError(502, 'AI_PROVIDER_ERROR', 'Failed to process AI response.', {
      reason: error instanceof Error ? error.message : 'unknown'
    });
  }
}

export async function generateInterviewerReply(input: {
  company: string;
  difficulty: string;
  duration: number;
  role?: string | null | undefined;
  transcript: Array<{ speaker: 'ai' | 'user'; text: string }>;
}): Promise<AiInterviewerReply> {
  return jsonCompletion<AiInterviewerReply>(buildInterviewerPrompt(input));
}

export async function generateEvaluationReport(input: {
  transcript: Array<{ speaker: 'ai' | 'user'; text: string }>;
  codeSubmissions: Array<{ language: string; code: string }>;
}): Promise<AiEvaluationReport> {
  return jsonCompletion<AiEvaluationReport>(buildEvaluationPrompt(input));
}
