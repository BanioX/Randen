import { Store } from 'lucide-react';
import { useBusiness } from '../../app/hooks';
import { needsSetup } from '../../app/modules';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { settingsMessages } from './messages';

const t = settingsMessages.setup;

/**
 * The offer to set Randen up (ADR-0015), for the cockpit until the business went through it.
 * It never blocks: the app works without, with the essentials.
 */
export function SetupPrompt() {
  const business = useBusiness();
  if (!needsSetup(business)) {
    return null;
  }
  return (
    <Notice
      icon={Store}
      title={t.title}
      action={
        <ButtonLink to={paths.setup()} size="sm">
          {t.start}
        </ButtonLink>
      }
    >
      {t.prompt}
    </Notice>
  );
}
