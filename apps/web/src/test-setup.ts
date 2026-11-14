import 'fake-indexeddb/auto';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// `findBy…` and `waitFor` give up after 1 s by default. With fake IndexedDB, live queries and
// several test runs at once, a correct page can take longer to settle and the test then fails at
// random. 5 s keeps real failures visible and stops the noise (lesson from Rettich, L-30).
configure({ asyncUtilTimeout: 5000 });

// Without Vitest globals the testing library does not clean up by itself: a page left over from
// the test before would answer the queries of the next one.
afterEach(() => {
  cleanup();
});
