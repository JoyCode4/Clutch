import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'
import {
  SystemMessage,
  HumanMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import type { Runnable } from '@langchain/core/runnables'
import type {
  LLMProvider,
  ChatSession,
  NeutralTool,
  ChatTurn,
} from './types'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// One model factory for every provider. Gemini uses its native LangChain
// integration; everything else (OpenAI, Groq, HuggingFace, custom) speaks the
// OpenAI-compatible API via ChatOpenAI with a base URL.
function makeModel(
  providerKey: string,
  apiKey: string,
  model: string,
  baseUrl: string,
) {
  if (providerKey === 'gemini') {
    return new ChatGoogleGenerativeAI({ apiKey, model, temperature: 0.2 })
  }
  return new ChatOpenAI({
    apiKey,
    model,
    temperature: 0.2,
    configuration: { baseURL: baseUrl, dangerouslyAllowBrowser: true },
  })
}

export function langchainProvider(
  providerKey: string,
  apiKey: string,
  model: string,
  baseUrl: string,
  geminiFallbacks: string[] = [],
): LLMProvider {
  return {
    startChat(system: string, tools: NeutralTool[]): ChatSession {
      // Tools in OpenAI format — LangChain converts them per-provider.
      const oaTools = tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bind = (m: any) => m.bindTools(oaTools) as Runnable

      let runnable = bind(makeModel(providerKey, apiKey, model, baseUrl))

      // Gemini: fall back across models when one is overloaded/quota-limited.
      if (providerKey === 'gemini' && geminiFallbacks.length) {
        const fallbacks = geminiFallbacks.map((m) =>
          bind(makeModel('gemini', apiKey, m, baseUrl)),
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runnable = (runnable as any).withFallbacks({ fallbacks })
      }

      const messages: BaseMessage[] = [new SystemMessage(system)]

      return {
        async send(input): Promise<ChatTurn> {
          if (typeof input === 'string') {
            messages.push(new HumanMessage(input))
          } else {
            for (const r of input) {
              messages.push(
                new ToolMessage({
                  content: JSON.stringify(r.response),
                  tool_call_id: r.callId ?? r.name,
                }),
              )
            }
          }

          // Retry transient failures: malformed tool-call generations (common
          // with Llama on Groq) and rate limits. Both usually pass on retry.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let ai: any
          let attempt = 0
          while (true) {
            try {
              ai = await runnable.invoke(messages)
              break
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              const toolParseFail =
                /tool_use_failed|failed to call a function|failed_generation|failed to parse/i.test(
                  msg,
                )
              const rateLimited = /rate_limit|429/i.test(msg)
              const transient =
                toolParseFail ||
                rateLimited ||
                /\[?5\d\d\]?|overloaded|unavailable|high demand/i.test(msg)
              attempt++
              if (transient && attempt <= 4) {
                await sleep(rateLimited ? 4000 : 500 * attempt)
                continue
              }
              throw e
            }
          }
          messages.push(ai)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const calls = (ai.tool_calls ?? []).map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            args: (tc.args ?? {}) as Record<string, unknown>,
          }))
          const text = typeof ai.content === 'string' ? ai.content : ''
          return { calls, text }
        },
      }
    },
  }
}
