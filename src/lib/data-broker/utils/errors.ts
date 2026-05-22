export class DataBrokerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "DataBrokerError";
  }
}

export class ProviderTimeoutError extends DataBrokerError {
  constructor(providerId: string, timeoutMs: number) {
    super(
      `Provider ${providerId} timed out after ${timeoutMs}ms`,
      "PROVIDER_TIMEOUT",
      { providerId, timeoutMs }
    );
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderError extends DataBrokerError {
  constructor(providerId: string, message: string, statusCode?: number) {
    super(`Provider ${providerId}: ${message}`, "PROVIDER_ERROR", {
      providerId,
      statusCode,
    });
    this.name = "ProviderError";
  }
}

export class BudgetExceededError extends DataBrokerError {
  constructor(
    budgetType: "request" | "board" | "global",
    limit: number,
    current: number
  ) {
    super(
      `${budgetType} budget exceeded: ${current}€ / ${limit}€`,
      "BUDGET_EXCEEDED",
      { budgetType, limit, current }
    );
    this.name = "BudgetExceededError";
  }
}

export class CircuitOpenError extends DataBrokerError {
  constructor(providerId: string) {
    super(
      `Circuit breaker open for provider ${providerId}`,
      "CIRCUIT_OPEN",
      { providerId }
    );
    this.name = "CircuitOpenError";
  }
}

export class ClassificationError extends DataBrokerError {
  constructor(message: string) {
    super(message, "CLASSIFICATION_ERROR");
    this.name = "ClassificationError";
  }
}
