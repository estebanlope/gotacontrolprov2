import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db'

/**
 * Returns the list of pending sync queue items that affect the balance.
 * Uses Dexie's live query so the component re-renders automatically
 * when items are added or removed from the queue.
 */
export function usePendingBalanceSync() {
  const pendingItems = useLiveQuery(
    () => db.sync_queue.where('affects_balance').equals(1).toArray(),
    []
  )

  return {
    hasPending: (pendingItems?.length ?? 0) > 0,
    count: pendingItems?.length ?? 0,
  }
}

