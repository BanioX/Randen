/**
 * Starts the app again from its first page after the data on the device changed (a restored
 * backup, a deleted business): every live query then reads what is there now. Its own file, so
 * the tests can replace it.
 */
export function reloadApp(): void {
  window.location.reload();
}
