import { Transform } from 'class-transformer';

/**
 * Trims surrounding whitespace from string input. Combined with @IsNotEmpty() this rejects
 * whitespace-only values on the server, regardless of what the client sends.
 */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
