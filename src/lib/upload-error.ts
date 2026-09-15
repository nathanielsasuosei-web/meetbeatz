/**
 * An error whose message is safe to show the admin. API routes turn it into a
 * 400 response; anything else becomes a 500.
 *
 * Kept in its own module (with no server-only imports) so the browser-side
 * upload form can share the validation helpers that throw it.
 */
export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
    // Required so `instanceof UploadError` still works when TypeScript targets ES5.
    Object.setPrototypeOf(this, UploadError.prototype);
  }
}
