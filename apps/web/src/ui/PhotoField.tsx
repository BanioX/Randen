import type { Photo } from '@randen/core';
import { Camera, FolderOpen, RefreshCw, Trash2, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { FieldGroup } from './Field';
import { formMessages } from './messages.forms';
import { compressPhoto } from './photo';
import { ZoomablePhoto } from './PhotoViewer';

const t = formMessages.photo;

/** The look of a quiet button, for the labels that open the camera or the file picker. */
const QUIET_BUTTON =
  'relative inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-5 font-semibold text-ink transition-colors';

export interface PhotoFieldProps {
  /** What the photo shows: «Foto des Platzes», «Foto des Gerichts». */
  label: string;
  hideLabel?: boolean | undefined;
  /** The photo as a JPEG data URL, or null without one. */
  value: Photo | null;
  onChange: (value: Photo | null) => void;
  hint?: string | undefined;
  /** An error the form found. */
  error?: string | null | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/**
 * A file input dressed as a button. The camera or the file picker opens only on this tap; the
 * words of the field are added for screen readers, so two photo fields on a page differ.
 */
function PickButton({
  icon: Icon,
  text,
  field,
  capture,
  disabled,
  onFile,
}: {
  icon: LucideIcon;
  text: string;
  field: string;
  capture?: 'environment' | undefined;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={`${QUIET_BUTTON} cursor-pointer hover:bg-surface-muted has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-wine-600 has-disabled:cursor-not-allowed has-disabled:opacity-50`}
    >
      <Icon size={20} aria-hidden="true" />
      {text}
      <span className="sr-only">, {field}</span>
      <input
        type="file"
        accept="image/*"
        capture={capture}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // The same picture can be chosen again after a failure.
          event.target.value = '';
          if (file !== undefined) {
            onFile(file);
          }
        }}
      />
    </label>
  );
}

/**
 * A photo of a spot or a dish. Two ways in: «Foto aufnehmen» opens the back camera, «Aus
 * Dateien wählen» the pictures of the device, so a device without a camera still has a way.
 * The picture is made small on the device (`compressPhoto`) and never leaves it. With a photo
 * the field shows it, large on a tap, with «Ersetzen» and «Entfernen».
 */
export function PhotoField({
  label,
  hideLabel,
  value,
  onChange,
  hint,
  error,
  disabled = false,
  className,
}: PhotoFieldProps) {
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);

  async function take(file: File) {
    setWorking(true);
    setFailed(false);
    try {
      onChange(await compressPhoto(file));
    } catch {
      setFailed(true);
    } finally {
      setWorking(false);
    }
  }

  const onFile = (file: File) => {
    void take(file);
  };
  const resting = disabled || working;

  return (
    <FieldGroup
      legend={label}
      hideLegend={hideLabel}
      hint={hint}
      error={failed ? t.failed : error}
      className={className}
    >
      {value === null ? (
        <div className="flex flex-wrap gap-2">
          <PickButton
            icon={Camera}
            text={t.take}
            field={label}
            capture="environment"
            disabled={resting}
            onFile={onFile}
          />
          <PickButton
            icon={FolderOpen}
            text={t.choose}
            field={label}
            disabled={resting}
            onFile={onFile}
          />
        </div>
      ) : (
        <div className="max-w-sm space-y-2">
          <ZoomablePhoto src={value} title={label} className="aspect-[4/3]" />
          <div className="flex flex-wrap gap-2">
            {/* Without `capture` the device offers both: its camera and its pictures. */}
            <PickButton
              icon={RefreshCw}
              text={t.replace}
              field={label}
              disabled={resting}
              onFile={onFile}
            />
            <button
              type="button"
              disabled={resting}
              onClick={() => {
                setFailed(false);
                onChange(null);
              }}
              className={`${QUIET_BUTTON} hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Trash2 size={20} aria-hidden="true" />
              {t.remove}
              <span className="sr-only">, {label}</span>
            </button>
          </div>
        </div>
      )}
      <p role="status" className="text-sm text-ink-muted">
        {working ? <span className="mt-1.5 block">{t.working}</span> : null}
      </p>
    </FieldGroup>
  );
}
