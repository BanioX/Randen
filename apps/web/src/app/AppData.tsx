import {
  createUseCases,
  ensureLocalBusiness,
  IdSchema,
  type Business,
  type Clock,
  type CurrencyCode,
  type Id,
  type IdGenerator,
  type LocalDate,
  type UseCases,
} from '@randen/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { browserClock, browserIds } from '../data/adapters';
import { RandenDb } from '../data/db';
import { dexieStorage } from '../data/dexie-storage';
import { requestPersistentStorage } from '../data/persistence';
import { messages } from './messages';

export interface AppData {
  businessId: Id;
  /** The business as it was when the app opened; `useBusiness()` gives the live one. */
  business: Business;
  /** Business currency (ADR-0004); amounts are integers in its smallest unit. */
  currency: CurrencyCode;
  /** Who is working on this device right now: the author of everything that gets booked. */
  staffId: Id;
  setStaff: (staffId: Id) => void;
  ids: IdGenerator;
  /** Swiss calendar day; refreshed when the app becomes visible again. */
  today: LocalDate;
  /** Every operation of the contract. Pages use `useQuery` and `useCommand` instead. */
  useCases: UseCases;
}

interface Profile {
  db: RandenDb;
  business: Business;
  staffId: Id;
}

const AppDataContext = createContext<AppData | null>(null);

let defaultDb: RandenDb | undefined;

interface ProviderProps {
  children: ReactNode;
  /** Tests pass their own database, clock and ids. */
  db?: RandenDb;
  clock?: Clock;
  ids?: IdGenerator;
}

/**
 * Opens the local database, makes sure a business exists and provides the contract to the UI.
 * Pages never touch the database (ADR-0003): they call `useQuery` and `useCommand`.
 */
export function AppDataProvider({
  children,
  db,
  clock = browserClock,
  ids = browserIds,
}: ProviderProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [today, setToday] = useState<LocalDate>(() => clock.today());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const database = db ?? (defaultDb ??= new RandenDb());
    // An object, not a `let`: the linter cannot see that the cleanup below changes it meanwhile.
    const run = { cancelled: false };
    (async () => {
      const local = await ensureLocalBusiness(dexieStorage(database), clock, ids, {
        business: messages.defaults.businessName,
        member: messages.defaults.memberName,
        areas: messages.defaults.areas,
      });
      // Local-first: ask the browser not to clear the data when space runs low.
      void requestPersistentStorage('storage' in navigator ? navigator.storage : undefined);
      const remembered = IdSchema.safeParse((await database.meta.get('currentStaffId'))?.value);
      const known = remembered.success
        ? (await database.rows('staff').get(remembered.data))?.businessId === local.business.id
        : false;
      if (!run.cancelled) {
        setProfile({
          db: database,
          business: local.business,
          staffId: known && remembered.success ? remembered.data : local.member.id,
        });
      }
    })().catch(() => {
      if (!run.cancelled) {
        setFailed(true);
      }
    });
    return () => {
      run.cancelled = true;
    };
  }, [db, clock, ids]);

  // A new day starts while the app is open in the background: refresh «today».
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        setToday((current) => {
          const now = clock.today();
          return current === now ? current : now;
        });
      }
    };
    document.addEventListener('visibilitychange', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [clock]);

  const setStaff = useCallback((staffId: Id) => {
    setProfile((current) => {
      if (current === null) {
        return current;
      }
      void current.db.meta.put({ key: 'currentStaffId', value: staffId });
      return { ...current, staffId };
    });
  }, []);

  const data = useMemo<AppData | null>(() => {
    if (profile === null) {
      return null;
    }
    return {
      businessId: profile.business.id,
      business: profile.business,
      currency: profile.business.currency,
      staffId: profile.staffId,
      setStaff,
      ids,
      today,
      useCases: createUseCases({
        storage: dexieStorage(profile.db),
        clock,
        ids,
        actor: profile.staffId,
      }),
    };
  }, [profile, setStaff, ids, clock, today]);

  if (failed) {
    return <p className="p-6 text-danger">{messages.errors.storage}</p>;
  }
  if (data === null) {
    return <p className="sr-only">{messages.loading}</p>;
  }
  return <AppDataContext.Provider value={data}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const data = useContext(AppDataContext);
  if (data === null) {
    throw new Error('useAppData must be used inside <AppDataProvider>');
  }
  return data;
}
