import {
  Building2,
  DatabaseBackup,
  FlaskConical,
  Info,
  SlidersHorizontal,
  UsersRound,
} from 'lucide-react';
import { businessKindLabel } from '@randen/core';
import { useBusiness, useQuery } from '../../app/hooks';
import { needsSetup, useModule, useModules } from '../../app/modules';
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
 * The team (a function of its own) shows only while the business uses it.
 */
export function MorePage() {
  const business = useBusiness();
  const modules = useModules();
  const teamOn = useModule('team');
  const staff = useQuery('staff.list', {}, { enabled: teamOn });
  const acting = staff?.staff.find((row) => row.acting);
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
      {teamOn && acting !== undefined ? (
        <GroupedList>
          <ListRow
            title={t.actingAs(acting.name)}
            subtitle={t.actingAsDetail}
            icon={UsersRound}
            to={paths.team()}
          />
        </GroupedList>
      ) : null}
      <Section title={t.business} titleStyle="group">
        <GroupedList>
          <ListRow
            title={t.business}
            subtitle={businessKindLabel(business.kind)}
            icon={Building2}
            to={paths.business()}
          />
          {teamOn ? (
            <ListRow
              title={t.team}
              subtitle={t.teamCount(staff?.staff.filter((row) => row.active).length ?? 0)}
              icon={UsersRound}
              to={paths.team()}
            />
          ) : null}
          <ListRow
            title={t.features}
            subtitle={needsSetup(business) ? t.featuresSetup : businessKindLabel(business.kind)}
            icon={SlidersHorizontal}
            to={paths.features()}
          />
          <ListRow title={t.data} subtitle={t.dataDetail} icon={DatabaseBackup} to={paths.data()} />
          <ListRow title={t.demo} subtitle={t.demoDetail} icon={FlaskConical} to={paths.demo()} />
          <ListRow title={t.about} subtitle={t.aboutDetail} icon={Info} to={paths.about()} />
        </GroupedList>
      </Section>
    </div>
  );
}
