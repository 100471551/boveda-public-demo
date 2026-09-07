export class ServiceUnavailableError extends Error {
  constructor(message = 'Demo access is temporarily unavailable.') {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

export class DataNotFoundError extends Error {
  constructor(message = 'The requested demo data is not available.') {
    super(message);
    this.name = 'DataNotFoundError';
  }
}
