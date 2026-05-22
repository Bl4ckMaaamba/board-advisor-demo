type EnvVar =
  | "BRAVE_API_KEY"
  | "TAVILY_API_KEY"
  | "FMP_API_KEY"
  | "PAPPERS_API_KEY"
  | "PISTE_CLIENT_ID"
  | "PISTE_CLIENT_SECRET"
  | "FRED_API_KEY"
  | "UPSTASH_REDIS_REST_URL"
  | "UPSTASH_REDIS_REST_TOKEN"
  | "ANTHROPIC_API_KEY";

export function getEnvVar(name: EnvVar): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnvVar(name: string): string | undefined {
  return process.env[name] || undefined;
}
