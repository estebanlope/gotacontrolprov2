/**
 * Cleanup Service - Automated data retention management
 * Handles deletion of inactive clients and related data
 */

import { supabase } from '@/lib/supabase'

export interface CleanupReport {
  client_id: string
  client_name: string
  last_loan_date: string
  months_inactive: number
  loan_count: number
}

export interface CleanupResult {
  success: boolean
  message: string
  threshold_months: number
  cutoff_date: string
  clients_deleted: number
  team_id: string
  error?: string
}

/**
 * Preview which clients would be deleted (dry run)
 * @param teamId Team to check
 * @param months Threshold in months (default 6)
 * @returns List of inactive clients that would be deleted
 */
export async function getInactiveClientsReport(
  teamId: string,
  months: number = 6
): Promise<CleanupReport[]> {
  try {
    const { data, error } = await supabase.rpc(
      'get_inactive_clients_report',
      {
        p_team_id: teamId,
        p_months: months,
      }
    )

    if (error) throw error

    return data || []
  } catch (error) {
    console.error('Error fetching inactive clients report:', error)
    throw error
  }
}

/**
 * Delete inactive clients (actual cleanup)
 * @param teamId Team to cleanup
 * @param months Threshold in months (default 6)
 * @returns Cleanup operation result
 */
export async function cleanupInactiveClients(
  teamId: string,
  months: number = 6
): Promise<CleanupResult> {
  try {
    const { data, error } = await supabase.rpc(
      'cleanup_inactive_clients',
      {
        p_team_id: teamId,
        p_months: months,
      }
    )

    if (error) throw error

    return data as CleanupResult
  } catch (error) {
    console.error('Error cleaning up inactive clients:', error)
    throw error
  }
}

/**
 * Scheduled cleanup job
 * Call this from a cron job (e.g., once per month)
 * @param teamId Team to cleanup
 * @param dryRun If true, only preview; if false, execute deletion
 */
export async function scheduledCleanup(
  teamId: string,
  dryRun: boolean = false
): Promise<void> {
  const months = 6

  try {
    console.log(`[Cleanup] Starting ${dryRun ? 'DRY RUN' : 'ACTUAL'} cleanup for team ${teamId}`)

    // Step 1: Get report
    const report = await getInactiveClientsReport(teamId, months)

    console.log(`[Cleanup] Found ${report.length} inactive clients to delete`)

    if (report.length > 0) {
      console.log('[Cleanup] Inactive clients:')
      report.forEach(client => {
        console.log(
          `  - ${client.client_name} (ID: ${client.client_id}): ` +
          `${client.months_inactive} months inactive, ${client.loan_count} loan(s)`
        )
      })
    }

    // Step 2: Execute cleanup (unless dry run)
    if (!dryRun && report.length > 0) {
      const result = await cleanupInactiveClients(teamId, months)

      if (result.success) {
        console.log(`[Cleanup] ✅ Successfully deleted ${result.clients_deleted} clients`)
      } else {
        console.error(`[Cleanup] ❌ Error: ${result.error}`)
      }
    } else if (dryRun) {
      console.log('[Cleanup] DRY RUN - No clients deleted')
    } else {
      console.log('[Cleanup] No inactive clients found')
    }
  } catch (error) {
    console.error('[Cleanup] Fatal error:', error)
    throw error
  }
}

