import { Check } from 'lucide-react';
import { EXTRA_GROUPS, useExtras, writeExtras } from '../../app/extras';
import { paths } from '../../app/paths';
import { Card } from '../../ui/Card';
import { GroupedList } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { Switch } from '../../ui/Switch';
import { settingsMessages } from './messages';

const t = settingsMessages.features;

/**
 * «Betrieb › Funktionen» (ADR-0014): what is always there, one switch for «Erweitert», and under
 * it every group of extras on its own, like the iOS settings. The choice belongs to this device
 * and changes no data.
 */
export function FeaturesPage() {
  const extras = useExtras();

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader
        title={t.title}
        back={{ to: paths.more(), label: settingsMessages.more.title }}
        subtitle={t.intro}
      />

      <Section title={t.essentialsTitle} titleStyle="group">
        <Card>
          <ul className="space-y-2">
            {t.essentials.map((line) => (
              <li key={line} className="flex items-start gap-3">
                <Check size={18} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      <Card>
        <Switch
          label={t.switchLabel}
          description={t.switchHint}
          checked={extras.on}
          onChange={(on) => {
            writeExtras({ ...extras, on });
          }}
        />
      </Card>

      {extras.on ? (
        <Section title={t.groupsTitle} titleStyle="group">
          <GroupedList>
            {EXTRA_GROUPS.map((group) => (
              <li
                key={group}
                className="relative px-4 py-2 not-first:border-t not-first:border-line"
              >
                <Switch
                  label={t.groups[group].title}
                  description={t.groups[group].detail}
                  checked={extras.groups[group]}
                  onChange={(checked) => {
                    writeExtras({ ...extras, groups: { ...extras.groups, [group]: checked } });
                  }}
                />
              </li>
            ))}
          </GroupedList>
        </Section>
      ) : null}
    </div>
  );
}
