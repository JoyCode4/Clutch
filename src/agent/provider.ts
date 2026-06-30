// Backwards-compatible re-exports. The real implementation now lives in ./llm,
// which supports Gemini, OpenAI, Groq, HuggingFace, and custom endpoints.
export { hasApiKey, llmLabel, llmModel, getProvider } from './llm'
