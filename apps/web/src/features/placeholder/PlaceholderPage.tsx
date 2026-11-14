import { messages } from '../../app/messages';

/** Stands in for an area until its module lands, so the whole navigation works from day one. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="space-y-3">
      <h1 className="large-title">{title}</h1>
      <p className="text-ink-muted">{messages.placeholder.text}</p>
    </div>
  );
}
