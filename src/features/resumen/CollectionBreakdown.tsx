import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
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
  preset?: string
}

export default function CollectionBreakdown({ teamId, userId, isAdmin, dateFrom, dateTo, preset }: Props) {
  const navigate = useNavigate()

  const { data: userData } = useQuery({
    queryKey: ['user-balance', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('balance')
        .eq('id', userId)
        .single()
      return data
    },
    enabled: !!userId,
  })

  const { data: teamUsers } = useQuery({
    queryKey: ['team-users-balance', teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from('users')
        .select('balance')
        .eq('team_id', teamId)
      return data ?? []
    },
    enabled: !!teamId && isAdmin,
  })

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

      // Expenses: all for admin, own for cobrador
      let expQ = supabase
        .from('expenses')
        .select('amount')
        .eq('team_id', teamId)
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59')

      if (!isAdmin) expQ = expQ.eq('created_by', userId)
      const { data: expenses } = await expQ

      // Capital prestado del periodo (loans disbursed)
      let loansQ = supabase
        .from('loans')
        .select('capital')
        .eq('team_id', teamId)
        .gte('disbursement_date', dateFrom)
        .lte('disbursement_date', dateTo)

      if (!isAdmin) loansQ = loansQ.eq('created_by', userId)
      const { data: loans } = await loansQ

      const cash = (payments ?? []).filter(p => p.method === 'cash').reduce((s, p) => s + p.amount, 0)
      const transfer = (payments ?? []).filter(p => p.method === 'transfer').reduce((s, p) => s + p.amount, 0)
      const total = cash + transfer
      const totalExpected = (expected ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0)
      const pending = Math.max(0, totalExpected - total)
      const totalExpenses = (expenses ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0)
      const capitalPrestado = (loans ?? []).reduce((s: number, l: { capital: number }) => s + l.capital, 0)

      return { cash, transfer, total, pending, totalExpected, totalExpenses, capitalPrestado }
    },
    enabled: !!teamId,
    staleTime: 1000 * 60,
  })

  if (!data) return null

  const isToday = preset === 'today'

  // Get dynamic balance
  const dynamicBalance = isAdmin
    ? (teamUsers?.reduce((sum, u) => sum + (u.balance ?? 0), 0) ?? 0)
    : (userData?.balance ?? 0)

  return (
    <Card>
      <CardTitle className="mb-3">💳 Desglose de Recaudo</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Total esperado" value={formatCurrency(data.totalExpected)} icon="📋" colorClass="text-gray-700" />

        {/* Recaudado total - Clickeable para ir a Pagos */}
        <button
          onClick={() => navigate('/pagos')}
          className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-green-50 hover:border-green-300 transition cursor-pointer text-left"
        >
          <p className="text-xs text-gray-500 font-medium">✅ Recaudado total</p>
          <p className="text-lg font-bold text-green-600 mt-1">{formatCurrency(data.total)}</p>
        </button>

        <StatCard label="Efectivo" value={formatCurrency(data.cash)} icon="💵" colorClass="text-green-700" />
        <StatCard label="Transferencia" value={formatCurrency(data.transfer)} icon="🔄" colorClass="text-blue-600" />
        <StatCard label="Pendiente" value={formatCurrency(data.pending)} icon="⏳" colorClass="text-orange-600" />

        {/* Gastos - Clickeable para ir a Gastos */}
        <button
          onClick={() => navigate('/gastos')}
          className="p-3 bg-white border border-gray-200 rounded-xl hover:bg-red-50 hover:border-red-300 transition cursor-pointer text-left"
        >
          <p className="text-xs text-gray-500 font-medium">📉 Gastos</p>
          <p className="text-lg font-bold text-red-600 mt-1">{formatCurrency(data.totalExpenses)}</p>
        </button>
      </div>

      {isToday && (
        <div className="mt-4">
          <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">💰 Saldo disponible</p>
              <p className="text-sm text-gray-400 mt-0.5">
                {isAdmin ? 'Suma de saldos de todos los usuarios' : 'Tu saldo asignado'}
              </p>
            </div>
            <span className="text-lg font-bold text-blue-700">
              {formatCurrency(dynamicBalance)}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}

