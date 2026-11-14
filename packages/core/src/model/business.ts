import { z } from 'zod';
import { CurrencyCodeSchema } from '../currency';
import { IdSchema } from '../ids';
import { BpsSchema, IsoDateTimeSchema, nameSchema, syncFields } from './primitives';

export const BusinessKindSchema = z.enum([
  'restaurant',
  'cafe',
  'hotel',
  'canteen',
  'catering',
  'takeaway',
  'bakery',
  'other',
]);
export type BusinessKind = z.infer<typeof BusinessKindSchema>;

/**
 * One kitchen with its stock, recipes and numbers («Betrieb»). Everything else belongs to
 * exactly one business; a second site is a second business.
 */
export const BusinessSchema = z.object({
  id: IdSchema,
  name: nameSchema(80),
  kind: BusinessKindSchema,
  /** Amounts are integers in the smallest unit of this currency (ADR-0004). */
  currency: CurrencyCodeSchema,
  /** Cost of goods as a share of net revenue the kitchen aims for, e.g. 3000 = 30 %. */
  targetFoodCostBps: BpsSchema,
  /** VAT of a dish unless the recipe says otherwise, e.g. 810 = 8.1 %. */
  defaultVatBps: BpsSchema,
  /** True while the business holds the demo data, so the app can offer to clear it. */
  demo: z.boolean().optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Business = z.infer<typeof BusinessSchema>;

export const StaffRoleSchema = z.enum(['owner', 'chef', 'cook', 'service', 'purchasing', 'other']);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

/** A person of the team, for «who did it» on stock, production and HACCP records. */
export const StaffMemberSchema = z.object({
  ...syncFields,
  name: nameSchema(60),
  role: StaffRoleSchema,
  active: z.boolean(),
});
export type StaffMember = z.infer<typeof StaffMemberSchema>;
