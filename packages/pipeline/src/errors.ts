/** Exit codes shared by the CLI and the weekly workflow. */
export const EXIT_OK = 0;
export const EXIT_VALIDATION = 2;
export const EXIT_NOT_READY = 3;

/** Input or output failed validation (schema drift, crosswalk gap, bad arguments). */
export class ValidationError extends Error {
  readonly exitCode = EXIT_VALIDATION;
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** The upstream data for the requested game is not complete yet; try again later. */
export class NotReadyError extends Error {
  readonly exitCode = EXIT_NOT_READY;
  constructor(message: string) {
    super(message);
    this.name = "NotReadyError";
  }
}
