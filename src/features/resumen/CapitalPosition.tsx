import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Card, { CardTitle } from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import { formatCurrency } from '@/lib/utils'

interface Props { teamId: string; dateFrom: string; dateTo: string }

export default function CapitalPosition({ teamId, dateFrom, dateTo }: Props) {
  const { data } = useQuery({
    queryKey: ['capital-position', teamId, dateFrom, dateTo],
    queryFn: async () => {
      const [configRes, loansRes, expensesRes] = await Promise.all([
        supabase.from('config').select('capital_base').eq('team_id', teamId).single(),
        supabase.from('loans').select('capital, interest_rate, status').eq('team_id', teamId),
        supabase.from('expenses').select('amount').eq('team_id', teamId),
      ])

      const capitalBase = configRes.data?.capital_base ?? 0
      const activeLoans = (loansRes.data ?? []).filter(l => l.status !== 'paid')
      const capitalEnCalle = activeLoans.reduce((s, l) => s + l.capital, 0)

      // Interest recovered: payments that exceed capital recovered
      const allLoans = loansRes.data ?? []
      let interesesRecuperados = 0
      for (const loan of allLoans) {
        const interest = loan.capital * (loan.interest_rate / 100)
        // simplified: count interest from paid loans
        if (loan.status === 'paid') interesesRecuperados += interest
      }

      const gastos = (expensesRes.data ?? []).reduce((s, e) => s + e.amount, 0)

      return { capitalBase, capitalEnCalle, interesesRecuperados, gastos }
    },
    enabled: !!teamId,
    staleTime: 1000 * 60,
  })

  if (!data) return null

  return (
    <Card>
      <CardTitle className="mb-3">💰 Posición de Capital</CardTitle>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Capital Base" value={formatCurrency(data.capitalBase)} icon="🏦" colorClass="text-gray-900" />
        <StatCard label="Capital en Calle" value={formatCurrency(data.capitalEnCalle)} icon="🚶" colorClass="text-orange-600" />
        <StatCard label="Intereses Recuperados" value={formatCurrency(data.interesesRecuperados)} icon="📈" colorClass="text-green-600" />
        <StatCard label="Gastos" value={formatCurrency(data.gastos)} icon="📉" colorClass="text-red-600" />
      </div>
    </Card>
  )
}

