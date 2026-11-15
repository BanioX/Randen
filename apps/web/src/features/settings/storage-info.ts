/** What the browser tells about the storage of this device (navigator.storage, no network). */
export interface StorageInfo {
  /** True when the browser keeps the data even when space runs low. */
  persisted?: boolean;
  /** Bytes in use by the app on this device. */
  used?: number;
  /** Bytes the browser allows the app. */
  quota?: number;
}

export async function readStorageInfo(): Promise<StorageInfo> {
  if (!('storage' in navigator)) {
    return {};
  }
  const manager = navigator.storage;
  const info: StorageInfo = {};
  try {
    info.persisted = await manager.persisted();
  } catch {
    // Not every browser answers this question; the line then says so.
  }
  try {
    const estimate = await manager.estimate();
    if (estimate.usage !== undefined) {
      info.used = estimate.usage;
    }
    if (estimate.quota !== undefined) {
      info.quota = estimate.quota;
    }
  } catch {
    // No estimate, no figure.
  }
  return info;
}
