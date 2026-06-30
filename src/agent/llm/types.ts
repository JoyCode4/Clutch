// Provider-agnostic LLM interface so the agent loop works with any backend
// (Gemini, OpenAI, Groq, HuggingFace, or any OpenAI-compatible endpoint).

export interface NeutralTool {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema (type: 'object', ...)
}

export interface ToolCall {
  id?: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  name: string
  callId?: string
  response: Record<string, unknown>
}

export interface ChatTurn {
  calls: ToolCall[]
  text: string
}

export interface ChatSession {
  // First call: pass the user string. Subsequent: pass tool results.
  send(input: string | ToolResult[]): Promise<ChatTurn>
}

export interface LLMProvider {
  startChat(system: string, tools: NeutralTool[]): ChatSession
}
