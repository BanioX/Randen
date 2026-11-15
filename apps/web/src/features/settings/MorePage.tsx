import { CircleEllipsis, FlaskConical, SlidersHorizontal } from 'lucide-react';
import { businessKindLabel } from '@randen/core';
import { useBusiness } from '../../app/hooks';
import { needsSetup, useModules } from '../../app/modules';
import { tabItemsFor, visibleNavGroups } from '../../app/nav';
import { paths } from '../../app/paths';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { settingsMessages } from './messages';

const t = settingsMessages.more;

/**
 * «Mehr»: on the iPhone every area the five tabs have no room for, then the business itself.
 * Built from the navigation, so a new area or a switched function (ADR-0015) shows here at once.
 * From the iPad upright the side navigation lists the areas, so only the business part stays.
 */
export function MorePage() {
  const business = useBusiness();
  const modules = useModules();
  const inTabs = new Set(tabItemsFor(modules).map((item) => item.to));
  const groups = visibleNavGroups(modules)
    .map((group) => ({ ...group, items: group.items.filter((item) => !inTabs.has(item.to)) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="space-y-8">
      <PageHeader title={t.title} />
      <div className="space-y-8 md:hidden">
        {groups.map((group) => (
          <Section key={group.id} title={group.label ?? t.title} titleStyle="group">
            <GroupedList>
              {group.items.map((item) => (
                <ListRow key={item.to} title={item.label} icon={item.icon} to={item.to} />
              ))}
            </GroupedList>
          </Section>
        ))}
      </div>
      <Section title={t.business} titleStyle="group">
        <GroupedList>
          <ListRow
            title={t.features}
            subtitle={needsSetup(business) ? t.featuresSetup : businessKindLabel(business.kind)}
            icon={SlidersHorizontal}
            to={paths.features()}
          />
          <ListRow title={t.demo} subtitle={t.demoDetail} icon={FlaskConical} to={paths.demo()} />
          <ListRow title={t.business} icon={CircleEllipsis} to={paths.business()} />
        </GroupedList>
      </Section>
    </div>
  );
}
