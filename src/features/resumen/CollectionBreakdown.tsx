import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Card, { CardTitle } from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import { formatCurrency } from '@/lib/utils'

interface Props {
  teamId: string
  userId: string
  isAdmin: boolean
  dateFrom: string
  dateTo: string
}

export default function CollectionBreakdown({ teamId, userId, isAdmin, dateFrom, dateTo }: Props) {
  const { data } = useQuery({
    queryKey: ['collection-breakdown', teamId, userId, isAdmin, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('payments')
        .select('amount, method')
        .eq('team_id', teamId)
        .gte('payment_date', dateFrom)
        .lte('payment_date', dateTo)

      if (!isAdmin) q = q.eq('created_by', userId)

      const { data: payments } = await q

      // Expected total from schedule entries up to dateTo
      let eQ = supabase
        .from('loan_schedule')
        .select('amount, loans!inner(team_id, created_by)')
        .eq('loans.team_id', teamId)
        .lte('due_date', dateTo)

      if (!isAdmin) eQ = eQ.eq('loans.created_by', userId)
      const { data: expected } = await eQ

      const cash = (payments ?? []).filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0)
      const transfer = (payments ?? []).filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0)
      const total = cash + transfer
      const totalExpected = (expected ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0)
      const pending = Math.max(0, totalExpected - total)

      return { cash, transfer, total, pending, totalExpected }
    },
    enabled: !!teamId,
    staleTime: 1000 * 60,
  })

  if (!data) return null

  return (
    <Card>
      <CardTitle className="mb-3">💳 Desglose de Recaudo</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total esperado" value={formatCurrency(data.totalExpected)} icon="📋" colorClass="text-gray-700" />
        <StatCard label="Recaudado total" value={formatCurrency(data.total)} icon="✅" colorClass="text-green-600" />
        <StatCard label="Efectivo" value={formatCurrency(data.cash)} icon="💵" colorClass="text-green-700" />
        <StatCard label="Transferencia" value={formatCurrency(data.transfer)} icon="🔄" colorClass="text-blue-600" />
        <StatCard label="Pendiente" value={formatCurrency(data.pending)} icon="⏳" colorClass="text-orange-600" />
      </div>
    </Card>
  )
}

