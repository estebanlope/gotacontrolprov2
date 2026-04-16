import { db } from '@/lib/db'
import { supabase } from '@/lib/supabase'
import type { SyncTable } from '@/types'

let isSyncing = false

/**
 * Processes all pending items in the sync queue.
 * Uses upsert with UUID as conflict target for safe offline/online merging.
 */
export async function syncAll(): Promise<void> {
  if (isSyncing) return
  isSyncing = true

  try {
    const pendingItems = await db.sync_queue.orderBy('created_at').toArray()

    for (const item of pendingItems) {
      try {
        const { error } = await supabase
          .from(item.table_name)
          .upsert(item.payload as Record<string, unknown>, { onConflict: 'id' })

        if (error) {
          console.error(`[SyncQueue] Error syncing ${item.table_name}:`, error.message)

          // Update retry count
          if (item.id !== undefined) {
            await db.sync_queue.update(item.id, {
              retry_count: item.retry_count + 1
            })
          }

          // Skip if too many retries
          if (item.retry_count >= 5) {
            console.warn(`[SyncQueue] Dropping ${item.table_name} record after 5 retries`)
            if (item.id !== undefined) await db.sync_queue.delete(item.id)
          }
        } else {
          // Apply balance delta if this operation affects balance
          if (item.affects_balance && item.balance_delta !== undefined && item.balance_user_id) {
            try {
              const { data: currentUser } = await supabase
                .from('users')
                .select('balance')
                .eq('id', item.balance_user_id)
                .single()

              if (currentUser) {
                const newBalance = Math.max(0, (currentUser.balance ?? 0) + item.balance_delta)
                await supabase
                  .from('users')
                  .update({ balance: newBalance })
                  .eq('id', item.balance_user_id)
              }
            } catch (balErr) {
              console.error('[SyncQueue] Error applying balance delta:', balErr)
            }
          }

          // Mark the local record as synced
          await markLocalSynced(item.table_name, item.record_id)
          if (item.id !== undefined) await db.sync_queue.delete(item.id)
        }
      } catch (err) {
        console.error('[SyncQueue] Unexpected error:', err)
      }
    }
  } finally {
    isSyncing = false
  }
}

async function markLocalSynced(table: SyncTable, recordId: string): Promise<void> {
  switch (table) {
    case 'clients':
      await db.clients.update(recordId, { synced: true })
      break
    case 'loans':
      await db.loans.update(recordId, { synced: true })
      break
    case 'loan_schedule':
      await db.loan_schedule.update(recordId, { synced: true })
      break
    case 'payments':
      await db.payments.update(recordId, { synced: true })
      break
    case 'expenses':
      await db.expenses.update(recordId, { synced: true })
      break
  }
}

/**
 * Adds a record to the sync queue for later processing.
 * Optionally tracks a balance delta to apply when the record syncs.
 */
export async function enqueueSync(
  table: SyncTable,
  recordId: string,
  action: 'insert' | 'update',
  payload: Record<string, unknown>,
  balanceDelta?: number,
  balanceUserId?: string
): Promise<void> {
  await db.sync_queue.add({
    table_name: table,
    record_id: recordId,
    action,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    affects_balance: balanceDelta !== undefined,
    balance_delta: balanceDelta,
    balance_user_id: balanceUserId,
  })
}

/**
 * Initializes the online event listener to auto-sync when connection is restored.
 */
export function initSyncListener(): void {
  window.addEventListener('online', () => {
    console.log('[SyncQueue] Connection restored — syncing...')
    syncAll()
  })

  // Also attempt sync on page load if online
  if (navigator.onLine) {
    syncAll()
  }
}
