import { type StaffRole } from '@randen/core';
import { settingsMessages } from './messages';

/** The roles of the team in the order the list shows them: from the owner to the others. */
export const ROLE_ORDER: readonly StaffRole[] = [
  'owner',
  'chef',
  'cook',
  'service',
  'purchasing',
  'other',
];

export function roleLabel(role: StaffRole): string {
  return settingsMessages.team.roles[role];
}

/** The role choices of a form, in the order of the team. */
export function roleOptions(): { value: StaffRole; label: string }[] {
  return ROLE_ORDER.map((role) => ({ value: role, label: roleLabel(role) }));
}
