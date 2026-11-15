import { useEffect, useState } from 'react';

import { paths } from '../../app/paths';
import { Card } from '../../ui/Card';
import { PageHeader } from '../../ui/PageHeader';
import { Section } from '../../ui/Section';
import { BackupSection } from './BackupSection';
import { DeleteSection } from './DeleteSection';
import { formatBytes } from './format';
import { RestoreSection } from './RestoreSection';
import { settingsMessages } from './messages';
import { readStorageInfo, type StorageInfo } from './storage-info';

const t = settingsMessages.data;

/**
 * «Daten und Sicherung» (H3-like sections): save the whole business to one file, bring one back,
 * see how the browser keeps the data, and delete everything at the end (ADR-0006).
 */
export function DataPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader
        title={t.title}
        back={{ to: paths.more(), label: settingsMessages.more.title }}
        subtitle={t.intro}
      />
      <BackupSection />
      <RestoreSection />
      <StorageSection />
      <DeleteSection />
    </div>
  );
}

/** Whether the browser keeps the data, and how much of the space is in use. */
function StorageSection() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readStorageInfo().then((next) => {
      if (!cancelled) {
        setInfo(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const persisted =
    info?.persisted === undefined
      ? t.persistUnknown
      : info.persisted
        ? t.persisted
        : t.notPersisted;
  const used =
    info?.used === undefined || info.quota === undefined
      ? t.usedUnknown
      : t.used(formatBytes(info.used), formatBytes(info.quota));

  return (
    <Section title={t.storageTitle} titleStyle="group">
      <Card>
        <div className="space-y-3">
          <p>{persisted}</p>
          <p className="text-ink-muted">{used}</p>
        </div>
      </Card>
    </Section>
  );
}
