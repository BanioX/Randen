import { Printer, type LucideIcon } from 'lucide-react';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import { fileMessages } from './messages.files';
import { usePrintAction, type PrintAction, type PrintNotice, type PrintPdf } from './print';
import { Sheet } from './Sheet';

const t = fileMessages.print;

/** What the sheet says for each notice. */
function NoticeText({ notice }: { notice: PrintNotice | null }) {
  if (notice === 'failed') {
    return <p>{t.failed}</p>;
  }
  if (notice === 'buildFailed') {
    return <p>{t.buildFailed}</p>;
  }
  return (
    <div className="space-y-3">
      <p>{t.pending}</p>
      <p className="text-ink-muted">{t.pendingToday}</p>
    </div>
  );
}

/**
 * What a tap on «Drucken» could not do, in the installed iOS app (ADR-0019): the PDF of this
 * page follows (`pending`), could not be prepared (`buildFailed`, with «Noch einmal»), or could
 * not be handed out (`failed`). Calm, with what works.
 */
export function PrintNoticeSheet({
  action,
}: {
  action: Pick<PrintAction, 'notice' | 'dismiss' | 'retry'>;
}) {
  const { notice, dismiss, retry } = action;
  return (
    <Sheet
      open={notice !== null}
      onClose={dismiss}
      title={t.sheetTitle}
      hideClose
      footer={
        notice === 'buildFailed' ? (
          <div className="flex flex-col gap-2">
            <Button fullWidth onClick={retry}>
              {t.retry}
            </Button>
            <Button fullWidth variant="secondary" onClick={dismiss}>
              {t.close}
            </Button>
          </div>
        ) : (
          <Button fullWidth onClick={dismiss}>
            {t.close}
          </Button>
        )
      }
    >
      <NoticeText notice={notice} />
    </Sheet>
  );
}

/**
 * «Drucken» on a page: the print dialog in a browser; in the app installed on an iPhone or iPad
 * the page's PDF through the share sheet (`pdf`), or, while a page has no PDF yet, a notice
 * that says so. Every print button of the app is this one, so a page gets its PDF by passing
 * `pdf` and nothing else changes.
 */
export function PrintButton({
  label,
  pdf,
  variant = 'secondary',
  size,
  icon = Printer,
  disabled,
  className,
}: {
  label: string;
  pdf?: PrintPdf | undefined;
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  icon?: LucideIcon | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}) {
  const action = usePrintAction(pdf);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        icon={icon}
        busy={action.busy}
        disabled={disabled}
        className={className}
        onClick={action.print}
      >
        {label}
      </Button>
      <PrintNoticeSheet action={action} />
    </>
  );
}
