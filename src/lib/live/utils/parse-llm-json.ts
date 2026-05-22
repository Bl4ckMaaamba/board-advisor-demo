/**
 * Parse JSON from an LLM response, tolerant of markdown code fences.
 * Claude/Sonnet sometimes wraps JSON in ```json … ``` even when asked not to.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseLlmJson<T = any>(text: string): T {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json|JSON)?\s*/, "").replace(/\s*```\s*$/, "");
  }
  return JSON.parse(s) as T;
}
