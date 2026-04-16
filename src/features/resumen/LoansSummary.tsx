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

export default function LoansSummary({ teamId, userId, isAdmin, dateFrom, dateTo }: Props) {
  const { data } = useQuery({
    queryKey: ['loans-summary', teamId, userId, isAdmin, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from('loans')
        .select('capital, client_id')
        .eq('team_id', teamId)
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59')

      if (!isAdmin) q = q.eq('created_by', userId)

      const { data: loans } = await q

      const count = (loans ?? []).length
      const totalCapital = (loans ?? []).reduce((s, l) => s + l.capital, 0)
      const uniqueClients = new Set((loans ?? []).map(l => l.client_id)).size

      return { count, totalCapital, uniqueClients }
    },
    enabled: !!teamId,
    staleTime: 1000 * 60,
  })

  if (!data) return null

  return (
    <Card>
      <CardTitle className="mb-3">🏦 Préstamos del Período</CardTitle>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Nuevos" value={data.count} icon="📝" colorClass="text-blue-600" />
        <StatCard label="Clientes" value={data.uniqueClients} icon="👥" colorClass="text-purple-600" />
        <StatCard label="Capital" value={formatCurrency(data.totalCapital)} icon="💰" colorClass="text-green-600" />
      </div>
    </Card>
  )
}

