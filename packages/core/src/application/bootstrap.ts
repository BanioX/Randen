import { DEFAULT_CURRENCY } from '../currency';
import { DEFAULT_TARGET_FOOD_COST_BPS, DEFAULT_VAT_BPS } from '../domain/vat';
import {
  BusinessSchema,
  StaffMemberSchema,
  type Business,
  type StaffMember,
} from '../model/business';
import { StorageAreaSchema } from '../model/storage-area';
import type { Clock, IdGenerator } from '../ports';
import { alive, type Storage } from '../ports/storage';

export interface LocalProfile {
  business: Business;
  member: StaffMember;
}

/**
 * Makes sure this device has a business to work in (ADR-0003): on the very first start it
 * quietly creates one with one person and the three storage areas every kitchen has. Later
 * starts return what is there. No account, no network.
 */
export async function ensureLocalBusiness(
  storage: Storage,
  clock: Clock,
  ids: IdGenerator,
  names: {
    business: string;
    member: string;
    areas: { cold: string; frozen: string; dry: string };
  },
): Promise<LocalProfile> {
  return storage.transaction(async () => {
    const existing = (await storage.businesses.all()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )[0];
    if (existing !== undefined) {
      const staff = alive(await storage.staff.ofBusiness(existing.id)).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      const member = staff.find((row) => row.active) ?? staff[0];
      if (member !== undefined) {
        return { business: existing, member };
      }
    }
    const now = clock.now();
    const business =
      existing ??
      BusinessSchema.parse({
        id: ids.next(),
        name: names.business,
        kind: 'restaurant',
        currency: DEFAULT_CURRENCY,
        targetFoodCostBps: DEFAULT_TARGET_FOOD_COST_BPS,
        defaultVatBps: DEFAULT_VAT_BPS,
        createdAt: now,
        updatedAt: now,
      });
    if (existing === undefined) {
      await storage.businesses.add(business);
      const areas = [
        { name: names.areas.cold, kind: 'cold', minDeciC: 0, maxDeciC: 50 },
        { name: names.areas.frozen, kind: 'frozen', maxDeciC: -180 },
        { name: names.areas.dry, kind: 'dry' },
      ] as const;
      for (const [index, area] of areas.entries()) {
        await storage.areas.add(
          StorageAreaSchema.parse({
            id: ids.next(),
            businessId: business.id,
            ...area,
            sortOrder: index,
            createdAt: now,
            updatedAt: now,
          }),
        );
      }
    }
    const member = StaffMemberSchema.parse({
      id: ids.next(),
      businessId: business.id,
      name: names.member,
      role: 'owner',
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await storage.staff.add(member);
    return { business, member };
  });
}
