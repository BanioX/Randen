import { z } from 'zod';
import { CurrencyCodeSchema } from '../currency';
import { IdSchema } from '../ids';
import { BpsSchema, IsoDateTimeSchema, nameSchema, syncFields } from './primitives';

/** The kind of business («Betriebsart», ADR-0015); it proposes the building blocks. */
export const BusinessKindSchema = z.enum([
  'restaurant',
  'cafe',
  'hotel',
  'canteen',
  'catering',
  'takeaway',
  'bakery',
  'other',
  // Since ADR-0015:
  'bistro',
  'lunch',
  'mensa',
  'central_kitchen',
  'care',
  'school',
]);
export type BusinessKind = z.infer<typeof BusinessKindSchema>;

/**
 * The switchable functions of a business (ADR-0015; «Funktionen» in the app, «Bausteine» in the
 * decision). Stock, articles, recipes and self-checks are the core and always there.
 */
export const ModuleIdSchema = z.enum([
  'menu_card',
  'ordering',
  'market',
  'production',
  'planning',
  'meals',
  'dispatch',
  'sales',
  'numbers',
  'places',
  'team',
]);
export type ModuleId = z.infer<typeof ModuleIdSchema>;

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
  /**
   * The building blocks the business works with (ADR-0015). Missing on a business from before
   * the decision: then every block is on, so nobody loses a function.
   */
  modules: z.array(ModuleIdSchema).max(20).optional(),
  /** When the business went through «Randen einrichten»; until then the cockpit offers it. */
  setupAt: IsoDateTimeSchema.optional(),
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
