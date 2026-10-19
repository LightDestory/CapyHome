export class HttpError extends Error {
  constructor(status, code, params = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}
