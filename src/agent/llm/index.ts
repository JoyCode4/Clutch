import type { LLMProvider } from './types'
import { langchainProvider } from './langchain'

export type { NeutralTool, ToolCall, ToolResult, ChatSession, ChatTurn } from './types'

interface Preset {
  base: string // '' = native Gemini SDK
  model: string
  label: string
}

const PRESETS: Record<string, Preset> = {
  gemini: { base: '', model: 'gemini-2.5-flash', label: 'Gemini' },
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', label: 'OpenAI' },
  groq: {
    base: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    label: 'Groq',
  },
  huggingface: {
    base: 'https://router.huggingface.co/v1',
    model: 'meta-llama/Llama-3.3-70B-Instruct',
    label: 'HuggingFace',
  },
  custom: { base: '', model: '', label: 'Custom' },
}

const env = import.meta.env

// Provider: explicit VITE_LLM_PROVIDER, else default to gemini.
const providerKey = (
  (env.VITE_LLM_PROVIDER as string) || 'gemini'
).toLowerCase()
const preset = PRESETS[providerKey] ?? PRESETS.gemini

// Key: generic VITE_LLM_API_KEY, falling back to the legacy Gemini var.
const apiKey =
  (env.VITE_LLM_API_KEY as string) ||
  (providerKey === 'gemini' ? (env.VITE_GEMINI_API_KEY as string) : '') ||
  ''

export const llmModel =
  (env.VITE_LLM_MODEL as string) ||
  (providerKey === 'gemini' ? (env.VITE_GEMINI_MODEL as string) : '') ||
  preset.model

const baseUrl = (env.VITE_LLM_BASE_URL as string) || preset.base

export const llmLabel = `${preset.label} · ${llmModel || '(set model)'}`
export const hasApiKey = !!apiKey && apiKey.length > 5

const GEMINI_FALLBACKS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
].filter((m) => m !== llmModel)

export function getProvider(): LLMProvider {
  if (!hasApiKey) {
    throw new Error(
      'No LLM API key. Set VITE_LLM_PROVIDER and VITE_LLM_API_KEY in your .env file.',
    )
  }
  if (providerKey !== 'gemini' && !baseUrl) {
    throw new Error(
      `Provider "${providerKey}" needs VITE_LLM_BASE_URL set in .env.`,
    )
  }
  return langchainProvider(
    providerKey,
    apiKey,
    llmModel,
    baseUrl,
    providerKey === 'gemini' ? GEMINI_FALLBACKS : [],
  )
}
