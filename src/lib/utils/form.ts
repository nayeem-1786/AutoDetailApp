import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';

// Wrapper around zodResolver that handles Zod v4 + react-hook-form type compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formResolver<T extends z.ZodType<any, any>>(schema: T) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return zodResolver(schema) as any;
}
