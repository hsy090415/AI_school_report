import type { AiApiErrorCode } from "../../types";

export class AiRequestError extends Error {
  constructor(
    public readonly code: AiApiErrorCode,
    message: string,
    public readonly status: 400 | 422 = 400,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}
