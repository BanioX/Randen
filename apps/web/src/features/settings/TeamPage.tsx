import { type StaffRole } from '@randen/core';
import { Plus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '../../app/hooks';
import { paths } from '../../app/paths';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { GroupedList, ListRow } from '../../ui/GroupedList';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { StaffSheet, type StaffDraft } from './StaffSheet';
import { settingsMessages } from './messages';
import { ROLE_ORDER, roleLabel } from './shared';

const t = settingsMessages.team;

/**
 * «Team» (ADR-0015, the function «team»): the people of the business as a grouped list by role.
 * A row opens the person in a sheet; the sheet adds people, switches the acting person and
 * removes people. The names are stored on this device only (SE-02).
 */
export function TeamPage() {
  const staff = useQuery('staff.list', {});
  const [editing, setEditing] = useState<StaffDraft | 'new' | null>(null);
  const people = staff?.staff ?? [];
  const activeCount = people.filter((person) => person.active).length;

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader
        title={t.title}
        back={{ to: paths.more(), label: settingsMessages.more.title }}
        subtitle={t.intro}
        actions={
          <Button
            icon={Plus}
            onClick={() => {
              setEditing('new');
            }}
          >
            {t.add}
          </Button>
        }
      />

      {people.length === 0 ? (
        <EmptyState icon={UsersRound} title={t.title} text={t.empty} />
      ) : (
        ROLE_ORDER.map((role: StaffRole) => {
          const members = people.filter((person) => person.role === role);
          if (members.length === 0) {
            return null;
          }
          return (
            <Section key={role} title={roleLabel(role)} titleStyle="group">
              <GroupedList>
                {members.map((person) => (
                  <ListRow
                    key={person.id}
                    title={person.name}
                    subtitle={person.acting ? t.acting : person.active ? undefined : t.inactive}
                    icon={UsersRound}
                    onClick={() => {
                      setEditing({
                        id: person.id,
                        name: person.name,
                        role: person.role,
                        active: person.active,
                        acting: person.acting,
                      });
                    }}
                  />
                ))}
              </GroupedList>
            </Section>
          );
        })
      )}

      <StaffSheet
        open={editing !== null}
        member={editing === 'new' || editing === null ? undefined : editing}
        lastActive={editing !== null && editing !== 'new' && editing.active && activeCount <= 1}
        onClose={() => {
          setEditing(null);
        }}
      />
    </div>
  );
}
