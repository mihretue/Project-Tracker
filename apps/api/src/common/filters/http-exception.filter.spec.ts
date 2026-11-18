import { ArgumentsHost, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let status: jest.Mock;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter = new AllExceptionsFilter();
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/tasks', method: 'GET' }),
      }),
    } as unknown as ArgumentsHost;
  });

  afterEach(() => jest.restoreAllMocks());

  it('never exposes internal error details for unhandled errors', () => {
    filter.catch(
      new Error('invalid input syntax for type uuid: "x" (table "tasks", constraint "FK_tasks_project")'),
      host,
    );

    expect(status).toHaveBeenCalledWith(500);
    const payload = json.mock.calls[0][0];
    expect(payload.message).toBe('Internal server error');
    // The echoed request path is expected; the error text must not appear anywhere else
    expect(JSON.stringify({ ...payload, path: undefined })).not.toMatch(
      /uuid|syntax|table|constraint|FK_/i,
    );
    expect(payload).not.toHaveProperty('stack');
  });

  it('still logs the real error for operators', () => {
    filter.catch(new Error('boom: secret detail'), host);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('boom: secret detail'),
      expect.any(String),
    );
  });

  it('keeps client-facing messages of HTTP exceptions', () => {
    filter.catch(new ForbiddenException('Access denied: nope'), host);
    expect(status).toHaveBeenCalledWith(403);
    expect(json.mock.calls[0][0].message).toBe('Access denied: nope');

    filter.catch(new BadRequestException(['field must be valid']), host);
    expect(status).toHaveBeenLastCalledWith(400);
    expect(json.mock.calls[1][0].message).toEqual(['field must be valid']);
  });
});
