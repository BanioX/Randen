import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router';

/** Back to the page this one was opened from, named as on iOS: chevron and that page's title. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="-ml-1.5 inline-flex min-h-11 items-center gap-0.5 rounded-lg pr-2 font-semibold text-wine-800"
    >
      <ChevronLeft size={24} aria-hidden="true" className="shrink-0" />
      {label}
    </Link>
  );
}
