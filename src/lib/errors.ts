/**
 * An error caused by bad user input or a missing/forbidden record, safe to show
 * to the user. Anything else is an unexpected failure and should not leak details.
 */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}
