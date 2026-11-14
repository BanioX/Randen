import { Link } from 'react-router';
import { messages } from './messages';
import { paths } from './paths';

/** An address that leads nowhere, or a row that was deleted. */
export function NotFoundPage({ text = messages.errors.notFoundText }: { text?: string }) {
  return (
    <div className="space-y-3">
      <h1 className="large-title">{messages.errors.notFoundTitle}</h1>
      <p className="text-ink-muted">{text}</p>
      <Link
        to={paths.cockpit()}
        className="inline-flex min-h-12 items-center rounded-xl font-semibold text-wine-700"
      >
        {messages.errors.home}
      </Link>
    </div>
  );
}
