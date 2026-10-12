/** Server-only provider settings. API keys must never be sent to the frontend. */
export function getAIProvider(lovableModel: string) {
  const geminiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (geminiKey) {
    return {
      apiKey: geminiKey,
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      model: Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3.6-flash",
    };
  }
  return {
    apiKey: Deno.env.get("LOVABLE_API_KEY")?.trim(),
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    model: lovableModel,
  };
}
