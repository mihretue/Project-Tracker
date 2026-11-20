import { describe, it, expect } from 'vitest';
import { validateTaskInput } from './validation';

describe('validateTaskInput duration', () => {
  it('treats a blank duration as valid (it is optional)', () => {
    expect(validateTaskInput('Task', '100.00')).toBeNull();
    expect(validateTaskInput('Task', '100.00', '   ')).toBeNull();
  });

  it.each(['0', '1', '14', '36500'])('accepts %s days', (value) => {
    expect(validateTaskInput('Task', '100.00', value)).toBeNull();
  });

  it.each(['2.5', '-1', 'abc', '36501', '1e3'])('rejects %s', (value) => {
    expect(validateTaskInput('Task', '100.00', value)).toMatch(/whole number of days/);
  });
});
