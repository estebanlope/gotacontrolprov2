import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import Card, { CardTitle } from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import { formatCurrency, colombiaDateToUTCStart, colombiaDateToUTCEnd } from '@/lib/utils'
import { usePendingBalanceSync } from '@/hooks/usePendingBalanceSync'

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
  const { hasPending, count: pendingCount } = usePendingBalanceSync()

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

  // Query for all pending schedule entries (for "Valor total del paquete")
  const { data: allPendingSchedule } = useQuery({
    queryKey: ['all-pending-schedule', teamId, userId, isAdmin],
    queryFn: async () => {
      let q = supabase
        .from('loan_schedule')
        .select('amount, loans!inner(team_id, created_by)')
        .eq('loans.team_id', teamId)
        .eq('status', 'pending')

      if (!isAdmin) q = q.eq('loans.created_by', userId)

      const { data } = await q
      return data ?? []
    },
    enabled: !!teamId && preset === 'today',
    staleTime: 1000 * 60,
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
        .eq('status', 'pending')
        .gte('due_date', dateFrom)
        .lte('due_date', dateTo)

      if (!isAdmin) eQ = eQ.eq('loans.created_by', userId)
      const { data: expected } = await eQ

      // Expenses: all for admin, own for cobrador
      let expQ = supabase
        .from('expenses')
        .select('amount')
        .eq('team_id', teamId)
        .gte('created_at', colombiaDateToUTCStart(dateFrom))
        .lte('created_at', colombiaDateToUTCEnd(dateTo))

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

  // Calculate total package value (all pending schedule entries)
  const totalPackageValue = (allPendingSchedule ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0)

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
               {hasPending && (
                 <p className="text-xs text-amber-600 font-medium mt-1">
                   ⚠️ {pendingCount} operación{pendingCount > 1 ? 'es' : ''} pendiente{pendingCount > 1 ? 's' : ''} de sincronizar
                 </p>
               )}
             </div>
             <span className={`text-lg font-bold ${hasPending ? 'text-amber-600' : 'text-blue-700'}`}>
               {formatCurrency(dynamicBalance)}
             </span>
           </div>

           <div className="bg-purple-50 rounded-xl p-3 flex items-center justify-between mt-3">
             <div>
               <p className="text-xs text-gray-500">📦 Valor total del paquete</p>
               <p className="text-sm text-gray-400 mt-0.5">
                 {isAdmin ? 'Todos los préstamos pendientes' : 'Tus préstamos pendientes'}
               </p>
             </div>
             <span className="text-lg font-bold text-purple-700">
               {formatCurrency(totalPackageValue)}
             </span>
           </div>
         </div>
       )}
    </Card>
  )
}

