import { z } from 'zod';
import { IdSchema } from '../ids';
import { IsoDateTimeSchema } from '../model/primitives';

/**
 * A domain event (ADR-0005): the fact that something changed, with who and when. Every command
 * appends at least one. The type is `<thing>.<what_happened>` in the past tense, the payload
 * carries ids and small facts, never whole rows and never photos.
 */
export const DomainEventSchema = z.object({
  id: IdSchema,
  type: z.string().regex(/^[a-z][a-z_]*\.[a-z][a-z_]*$/, 'Expected thing.what_happened'),
  version: z.literal(1),
  businessId: IdSchema,
  actor: IdSchema,
  at: IsoDateTimeSchema,
  payload: z.record(z.string(), z.unknown()),
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;
