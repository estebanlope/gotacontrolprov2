import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Card, { CardTitle } from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils'

interface Props {
  teamId: string
  userId: string
  isAdmin: boolean
  dateFrom: string
  dateTo: string
}

export default function CollectionProgress({ teamId, userId, isAdmin, dateFrom, dateTo }: Props) {
  const { data } = useQuery({
    queryKey: ['collection-progress', teamId, userId, isAdmin, dateFrom, dateTo],
    queryFn: async () => {
      // Expected: all pending schedule entries in range
      let expectedQuery = supabase
        .from('loan_schedule')
        .select('amount, loans!inner(team_id, created_by)')
        .eq('loans.team_id', teamId)
        .eq('status', 'pending')
        .gte('due_date', dateFrom)
        .lte('due_date', dateTo)

      if (!isAdmin) expectedQuery = expectedQuery.eq('loans.created_by', userId)

      // Collected: payments in range
      let collectedQuery = supabase
        .from('payments')
        .select('amount')
        .eq('team_id', teamId)
        .gte('payment_date', dateFrom)
        .lte('payment_date', dateTo)

      if (!isAdmin) collectedQuery = collectedQuery.eq('created_by', userId)

      const [expectedRes, collectedRes] = await Promise.all([expectedQuery, collectedQuery])

      const totalExpected = (expectedRes.data ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0)
      const totalCollected = (collectedRes.data ?? []).reduce((s: number, p: { amount: number }) => s + p.amount, 0)
      const pct = totalExpected > 0 ? Math.min(100, (totalCollected / totalExpected) * 100) : 0

      return { totalExpected, totalCollected, pct }
    },
    enabled: !!teamId,
    staleTime: 1000 * 60,
  })

  if (!data) return null

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <CardTitle>📊 Progreso de Cobranza</CardTitle>
        <span className="text-lg font-bold text-blue-600">{data.pct.toFixed(0)}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-4 mb-3">
        <div
          className={`h-4 rounded-full transition-all ${data.pct >= 80 ? 'bg-green-500' : data.pct >= 50 ? 'bg-blue-500' : 'bg-orange-400'}`}
          style={{ width: `${data.pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 flex-wrap gap-1">
        <span>Recaudado: <span className="font-semibold text-gray-700">{formatCurrency(data.totalCollected)}</span></span>
        <span>Esperado: <span className="font-semibold text-gray-700">{formatCurrency(data.totalExpected)}</span></span>
      </div>
    </Card>
  )
}

