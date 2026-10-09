import { useEffect, useState } from 'react';
import { onSyncStatus, syncStatus, type SyncStatus } from './sync';

/** The sync state and the logged-in account (null when the app runs local-only). */
export function useSyncStatus(): SyncStatus {
  const [s, set] = useState(syncStatus);
  useEffect(() => onSyncStatus(set), []);
  return s;
}
