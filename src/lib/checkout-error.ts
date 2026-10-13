/**
 * The error every checkout path throws when the *customer* did something that
 * cannot be completed — as opposed to an unexpected failure, which the API routes
 * turn into a 500.
 *
 * It lives in its own module because both `payments.ts` and the feature modules
 * that feed it (`distribution.ts`, and anything else that validates a submission
 * before an order exists) need to raise it. Importing it from `payments.ts`
 * would make those modules part of an import cycle with it.
 */
export class CheckoutError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
