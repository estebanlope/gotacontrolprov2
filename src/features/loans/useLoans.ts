import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'
import type { Loan, LoanScheduleEntry } from '@/types'

export function useLoans() {
  const { user } = useAuth()

  return useQuery<Loan[]>({
    queryKey: ['loans', user?.team_id, user?.id, user?.role],
    queryFn: async () => {
      if (!navigator.onLine) {
        const local = await db.loans.where('team_id').equals(user!.team_id!).toArray()
        if (user?.role === 'cobrador') return local.filter(l => l.created_by === user.id)
        return local
      }

      let query = supabase
        .from('loans')
        .select('*')
        .eq('team_id', user!.team_id!)
        .order('created_at', { ascending: false })

      if (user?.role === 'cobrador') query = query.eq('created_by', user.id)

      const { data, error } = await query
      if (error) throw error
      if (data) await db.loans.bulkPut(data.map(l => ({ ...l, synced: true })))
      return data ?? []
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

