/**
 * Files in and out of the app (ADR-0006, SE-10 and SE-11): a backup is saved where the person
 * chooses, and read from the file they picked. Nothing is sent anywhere.
 */

/** Saves a text as a file: the browser offers it as a download (SE-10). */
export function saveTextFile(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked later: some browsers start the download only after the click has returned.
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

/** Reads a file the person picked, as text (SE-11). */
export function readTextFile(file: Blob): Promise<string> {
  return file.text();
}
