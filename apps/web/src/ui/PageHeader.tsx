import type { ReactNode } from 'react';
import { BackLink } from './BackLink';

interface PageHeaderProps {
  title: string;
  /** One quiet line under the title: what the page is for, or where its numbers stand. */
  subtitle?: ReactNode | undefined;
  /** The page this one was opened from: «‹ Lager». */
  back?: { to: string; label: string } | undefined;
  /** Buttons of the page: beside the title from tablet width, under it on the phone. */
  actions?: ReactNode | undefined;
  /** `2` only where a page shows a second header, such as the style guide. */
  level?: 1 | 2 | undefined;
}

/**
 * The top of every page: where you came from, the large title, and what you can do here.
 * No brand bar above it; the title leads.
 */
export function PageHeader({ title, subtitle, back, actions, level = 1 }: PageHeaderProps) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <header className="mb-6">
      {back === undefined ? null : <BackLink to={back.to} label={back.label} />}
      <div className="md:flex md:items-end md:justify-between md:gap-6">
        <div className="min-w-0">
          <Heading className="large-title hyphens-calm break-words">{title}</Heading>
          {subtitle === undefined ? null : <p className="mt-1 text-ink-muted">{subtitle}</p>}
        </div>
        {actions === undefined ? null : (
          <div className="mt-4 flex flex-wrap gap-2 md:mt-0 md:shrink-0 md:justify-end">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
