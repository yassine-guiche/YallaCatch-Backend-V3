import { z } from 'zod';
import { JSONValue } from '@/types';

export const JsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)])
);
