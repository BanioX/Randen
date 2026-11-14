import { Utensils, type LucideIcon } from 'lucide-react';
import { displayMessages } from './messages.display';

interface DishPhotoProps {
  /** The picture as kept on the device (a data URL); without it a quiet placeholder. */
  photo?: string | undefined;
  /** What the picture shows; `""` when the name stands right beside it. */
  alt: string;
  /** `square` 1:1 (rows, tiles), `card` 4:3 (cards), `wide` 16:9 (the top of a page). */
  ratio?: 'square' | 'wide' | 'card' | undefined;
  /** The icon of the placeholder: a plate for dishes, e.g. `MapPin` for a storage spot. */
  icon?: LucideIcon | undefined;
  /** Corner radius: `md` (12 px) for small tiles in rows, `lg` (16 px) for cards. */
  radius?: 'md' | 'lg' | undefined;
  /** The width, e.g. `size-10` or `w-full` (the default); the height follows the ratio. */
  className?: string | undefined;
}

const ratios = { square: 'aspect-square', wide: 'aspect-video', card: 'aspect-4/3' } as const;

/**
 * The picture of a dish or of a storage spot in a rounded frame of fixed proportions, so lists
 * do not jump while pictures load. The picture never takes a click from the row around it.
 */
export function DishPhoto({
  photo,
  alt,
  ratio = 'square',
  icon: Icon = Utensils,
  radius = 'lg',
  className = 'w-full',
}: DishPhotoProps) {
  const frame = `block shrink-0 overflow-hidden bg-surface-muted ${ratios[ratio]} ${
    radius === 'md' ? 'rounded-xl' : 'rounded-2xl'
  } ${className}`;
  if (photo === undefined) {
    return (
      <span
        role={alt === '' ? undefined : 'img'}
        aria-label={alt === '' ? undefined : `${alt}: ${displayMessages.photo.missing}`}
        aria-hidden={alt === '' ? true : undefined}
        className={`${frame} flex items-center justify-center text-ink-muted`}
      >
        <Icon strokeWidth={1.5} aria-hidden="true" className="size-2/5 max-h-10 max-w-10" />
      </span>
    );
  }
  return (
    <span className={frame}>
      <img
        src={photo}
        alt={alt}
        draggable={false}
        className="pointer-events-none size-full object-cover select-none"
      />
    </span>
  );
}
