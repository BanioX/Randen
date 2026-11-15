import { formatDecimal, formatSwissDate } from '@randen/core';
import { ExternalLink } from 'lucide-react';
import { useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { KpiGrid, StatTile } from '../../ui/StatTile';
import { formatBytes } from './format';
import { settingsMessages } from './messages';

const t = settingsMessages.about;

/** The figures of the business on this device, as the storage counts them now. */
const COUNTED = [
  ['articles', t.articles],
  ['lots', t.lots],
  ['movements', t.movements],
  ['recipes', t.recipes],
  ['productions', t.productions],
  ['sales', t.sales],
] as const;

/**
 * «Über Randen»: what Randen is, the figures on this device, that the data stays here, and that
 * Randen is a help and no replacement for the self-control concept (ADR-0012).
 */
export function AboutPage() {
  const about = useQuery('settings.about', {});

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title={t.title} back={{ to: paths.more(), label: settingsMessages.more.title }} />
      <Card>
        <div className="space-y-4">
          <p className="text-ink">{t.intro}</p>
          <p className="text-ink">{t.data}</p>
          <p className="text-ink-muted">{t.help}</p>
        </div>
      </Card>

      <Section title={t.figures} titleStyle="group">
        {about === undefined ? (
          <p role="status" className="text-ink-muted">
            {t.loading}
          </p>
        ) : (
          <div className="space-y-5">
            <KpiGrid>
              {COUNTED.map(([name, label]) => (
                <StatTile
                  key={name}
                  label={label}
                  value={formatDecimal(about.counts[name], { digits: 0 })}
                />
              ))}
            </KpiGrid>
            <Card>
              <ul className="space-y-2">
                <li>
                  {t.staff}: {formatDecimal(about.counts.staff, { digits: 0 })}
                </li>
                <li>
                  {about.movements.oldest === undefined || about.movements.newest === undefined
                    ? t.noMovements
                    : t.span(
                        formatSwissDate(about.movements.oldest),
                        formatSwissDate(about.movements.newest),
                      )}
                </li>
                <li>
                  {about.photos.count === 0
                    ? t.noPhotos
                    : t.photos(about.photos.count, formatBytes(about.photos.characters))}
                </li>
              </ul>
            </Card>
          </div>
        )}
      </Section>

      <Card>
        <div className="space-y-4">
          <p className="text-ink-muted">{t.licence}</p>
          <div>
            <ButtonLink to={paths.styleguide()} variant="secondary" icon={ExternalLink}>
              {t.styleguide}
            </ButtonLink>
          </div>
        </div>
      </Card>
    </div>
  );
}
