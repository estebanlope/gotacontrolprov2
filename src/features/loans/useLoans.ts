import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'
import type { Loan, LoanScheduleEntry } from '@/types'

export type LoanWithClient = Loan & { client_name?: string }

export function useLoans() {
  const { user } = useAuth()

  return useQuery<LoanWithClient[]>({
    queryKey: ['loans', user?.team_id, user?.id, user?.role],
    queryFn: async () => {
      if (!navigator.onLine) {
        let local = await db.loans.where('team_id').equals(user!.team_id!).toArray()
        if (user?.role === 'cobrador') local = local.filter(l => l.created_by === user.id)
        // Enrich with client names from local Dexie
        const clientIds = [...new Set(local.map(l => l.client_id))]
        const localClients = await db.clients.where('id').anyOf(clientIds).toArray()
        const clientMap = Object.fromEntries(localClients.map(c => [c.id, c.full_name]))
        return local.map(l => ({ ...l, client_name: clientMap[l.client_id] }))
      }

      let query = supabase
        .from('loans')
        .select('*, clients(full_name)')
        .eq('team_id', user!.team_id!)
        .order('created_at', { ascending: false })

      if (user?.role === 'cobrador') query = query.eq('created_by', user.id)

      const { data, error } = await query
      if (error) throw error
      const loans = data ?? []
      // Store base loan data locally (without the joined clients field)
      await db.loans.bulkPut(loans.map(l => {
        const { clients: _c, ...loan } = l as typeof l & { clients?: unknown }
        return { ...loan, synced: true }
      }))
      return loans.map(l => ({
        ...l,
        client_name: (l as unknown as { clients?: { full_name: string } }).clients?.full_name,
      }))
    },
    enabled: !!user?.team_id,
    staleTime: 1000 * 60 * 2,
  })
}

export function useLoan(id: string) {
  return useQuery<Loan | null>({
    queryKey: ['loan', id],
    queryFn: async () => {
      if (!navigator.onLine) return (await db.loans.get(id)) ?? null
      const { data, error } = await supabase.from('loans').select('*').eq('id', id).single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })
}

export function useLoanSchedule(loanId: string) {
  return useQuery<LoanScheduleEntry[]>({
    queryKey: ['loan-schedule', loanId],
    queryFn: async () => {
      if (!navigator.onLine) {
        return await db.loan_schedule.where('loan_id').equals(loanId).toArray()
      }
      const { data, error } = await supabase
        .from('loan_schedule')
        .select('*')
        .eq('loan_id', loanId)
        .order('due_date', { ascending: true })
      if (error) throw error
      if (data) await db.loan_schedule.bulkPut(data.map(s => ({ ...s, synced: true })))
      return data ?? []
    },
    enabled: !!loanId,
  })
}

