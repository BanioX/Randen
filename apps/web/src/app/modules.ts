import { modulesInUse, type Business, type ModuleId } from '@randen/core';
import { useMemo } from 'react';
import { useBusiness } from './hooks';
import { useDetailed } from './view';

/**
 * The functions of the business on this device (ADR-0015). Hiding a function hides its entry
 * points only: its data stays, in the database and in the backup, and a saved address still
 * opens its page.
 */
export function useModules(): ReadonlySet<ModuleId> {
  const business = useBusiness();
  const detailed = useDetailed();
  const key = modulesInUse(business, detailed).join(',');
  return useMemo(() => new Set(key === '' ? [] : (key.split(',') as ModuleId[])), [key]);
}

/** Whether one function of the business is in use: `useModule('market')`. */
export function useModule(id: ModuleId): boolean {
  return useModules().has(id);
}

/** True until the business went through «Randen einrichten»; the demo needs no setup. */
export function needsSetup(business: Pick<Business, 'setupAt' | 'demo'>): boolean {
  return business.setupAt === undefined && business.demo !== true;
}
