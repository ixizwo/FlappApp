import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().nonnegative(),
  });

  it('passes valid input through unchanged', () => {
    const pipe = new ZodValidationPipe(schema);
    expect(pipe.transform({ name: 'Ada', age: 30 })).toEqual({
      name: 'Ada',
      age: 30,
    });
  });

  it('throws a BadRequestException with structured issues on invalid input', () => {
    const pipe = new ZodValidationPipe(schema);
    try {
      pipe.transform({ name: '', age: -1 });
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const body = (err as BadRequestException).getResponse() as {
        message: string;
        issues: { path: string }[];
      };
      expect(body.message).toBe('Validation failed');
      expect(body.issues.map((i) => i.path).sort()).toEqual(['age', 'name']);
    }
  });
});
