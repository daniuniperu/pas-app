/**
 * Typed domain errors for the PAS API.
 *
 * Using explicit error classes instead of plain Error strings allows routes
 * to catch specific error types and return the appropriate HTTP status without
 * inspecting message strings.
 */

export class PolicyNotFoundError extends Error {
  constructor(policyId: string) {
    super(`Policy ${policyId} not found`);
    this.name = "PolicyNotFoundError";
  }
}

export class PolicyNotActiveError extends Error {
  constructor(policyId: string, status: string) {
    super(`Policy ${policyId} is not active (status: ${status})`);
    this.name = "PolicyNotActiveError";
  }
}

export class CurrencyMismatchError extends Error {
  constructor(expected: string, got: string) {
    super(`Currency mismatch: policy is ${expected}, payment is ${got}`);
    this.name = "CurrencyMismatchError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(key: string) {
    super(`Idempotency key already used with a different payload: ${key}`);
    this.name = "IdempotencyConflictError";
  }
}

export class InvalidEffectiveDateError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidEffectiveDateError";
  }
}
