/**
 * Files in and out of the app (ADR-0006, SE-10 and SE-11): a backup is saved where the person
 * chooses (`ui/share-file.ts`: a download, or the share sheet in the installed iOS app,
 * ADR-0019), and read from the file they picked. Nothing is sent anywhere.
 */

/** Reads a file the person picked, as text (SE-11). */
export function readTextFile(file: Blob): Promise<string> {
  return file.text();
}
