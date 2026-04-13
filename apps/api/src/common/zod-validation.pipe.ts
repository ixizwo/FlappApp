import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

/**
 * Bridges zod schemas (shared with the web app via @flappapp/shared) into
 * Nest's DI-driven validation. Usage:
 *
 *   @Post()
 *   create(
 *     @Body(new ZodValidationPipe(ModelObjectCreateSchema)) dto: ModelObjectCreate,
 *   ) { ... }
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          issues: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
            code: i.code,
          })),
        });
      }
      throw err;
    }
  }
}
