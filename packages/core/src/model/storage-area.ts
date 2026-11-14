import { z } from 'zod';
import { AreaKindSchema } from '../domain/categories';
import { IdSchema } from '../ids';
import { DeciCelsiusSchema, nameSchema, PhotoSchema, syncFields, textSchema } from './primitives';

/**
 * A room or appliance where goods are kept («Lagerbereich»): cold room, freezer, dry store, bar.
 * Its temperature range is what the self-control checks against (HACCP).
 */
export const StorageAreaSchema = z.object({
  ...syncFields,
  name: nameSchema(60),
  kind: AreaKindSchema,
  minDeciC: DeciCelsiusSchema.optional(),
  maxDeciC: DeciCelsiusSchema.optional(),
  photo: PhotoSchema.optional(),
  sortOrder: z.int().min(0).max(999),
});
export type StorageArea = z.infer<typeof StorageAreaSchema>;

/**
 * A named place inside an area («Platz»): «Regal 2, oben», «Schublade Fisch». With a photo it
 * shows new staff where things are («Wo ist was?»).
 */
export const StorageSpotSchema = z.object({
  ...syncFields,
  areaId: IdSchema,
  name: nameSchema(60),
  note: textSchema(300).optional(),
  photo: PhotoSchema.optional(),
  sortOrder: z.int().min(0).max(999),
});
export type StorageSpot = z.infer<typeof StorageSpotSchema>;
