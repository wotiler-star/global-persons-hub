// LLM 服务：OpenAI 兼容 /chat/completions。未配置时返回 null，RAG 退化为抽取式作答。
// 配置：GPH_LLM_API_URL（必填启用）、GPH_LLM_API_KEY、GPH_LLM_MODEL（默认 gpt-4o-mini）

export interface LlmProvider {
  complete(system: string, user: string): Promise<string>;
}

export async function getLlm(): Promise<LlmProvider | null> {
  const url = process.env.GPH_LLM_API_URL;
  if (!url) return null;
  const key = process.env.GPH_LLM_API_KEY;
  const model = process.env.GPH_LLM_MODEL || 'gpt-4o-mini';
  return {
    async complete(system: string, user: string): Promise<string> {
      const r = await fetch(`${url.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key ? { Authorization: `Bearer ${key}` } : {})
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          temperature: 0.2
        })
      });
      if (!r.ok) throw new Error(`llm ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      return (j.choices?.[0]?.message?.content as string) || '';
    }
  };
}
