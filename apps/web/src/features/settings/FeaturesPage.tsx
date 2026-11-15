import { businessKindLabel, MODULE_IDS, switchModule, type ModuleId } from '@randen/core';
import { Check, Store } from 'lucide-react';
import { useState } from 'react';
import { errorText, useBusiness, useCommand } from '../../app/hooks';
import { needsSetup, useModules } from '../../app/modules';
import { paths } from '../../app/paths';
import { useDetailed, writeDetailed } from '../../app/view';
import { Card } from '../../ui/Card';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { Notice } from '../../ui/Notice';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { settingsMessages } from './messages';

const t = settingsMessages.features;

/**
 * «Betrieb › Funktionen» (ADR-0015): the kind of business with the way to set it up again, what
 * is always there, a switch per function of the business, and the view of this device
 * (ADR-0014). A switch takes effect at once, like the iOS settings; hidden functions keep their
 * data.
 */
export function FeaturesPage() {
  const business = useBusiness();
  const modules = useModules();
  const detailed = useDetailed();
  const run = useCommand();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const change = async (id: ModuleId, on: boolean) => {
    setError(null);
    try {
      await run('business.update', { modules: switchModule(modules, id, on) });
    } catch (caught) {
      setError(errorText(caught));
      toast({ text: errorText(caught), tone: 'danger' });
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader
        title={t.title}
        back={{ to: paths.more(), label: settingsMessages.more.title }}
        subtitle={t.intro}
      />

      <GroupedList>
        <ListRow
          title={t.kindLabel}
          subtitle={needsSetup(business) ? t.kindSetup : businessKindLabel(business.kind)}
          icon={Store}
          to={paths.setup()}
          trailing={<span className="text-sm font-medium text-wine-700">{t.redo}</span>}
        />
      </GroupedList>

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

      <Section title={t.modulesTitle} titleStyle="group">
        {error === null ? null : <Notice tone="danger">{error}</Notice>}
        <GroupedList>
          {MODULE_IDS.map((id) => (
            <li key={id} className="relative px-4 py-2 not-first:border-t not-first:border-line">
              <Switch
                label={settingsMessages.modules[id].title}
                description={settingsMessages.modules[id].detail}
                checked={modules.has(id)}
                onChange={(checked) => {
                  void change(id, checked);
                }}
              />
            </li>
          ))}
        </GroupedList>
      </Section>

      <Section title={t.deviceTitle} titleStyle="group">
        <Card>
          <Switch
            label={t.switchLabel}
            description={t.switchHint}
            checked={detailed}
            onChange={writeDetailed}
          />
        </Card>
      </Section>
    </div>
  );
}
