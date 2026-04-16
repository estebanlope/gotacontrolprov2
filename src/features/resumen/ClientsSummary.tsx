import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Card, { CardTitle } from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'

interface Props { teamId: string; isAdmin: boolean }

export default function ClientsSummary({ teamId, isAdmin }: Props) {
  const { data } = useQuery({
    queryKey: ['clients-summary', teamId, isAdmin],
    queryFn: async () => {
      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .eq('team_id', teamId)

      const { data: activeLoans } = await supabase
        .from('loans')
        .select('client_id')
        .eq('team_id', teamId)
        .in('status', ['active', 'overdue', 'pending'])

      const total = (clients ?? []).length
      const activeClientIds = new Set((activeLoans ?? []).map(l => l.client_id))
      const active = activeClientIds.size
      const inactive = total - active

      return { total, active, inactive }
    },
    enabled: !!teamId,
    staleTime: 1000 * 60 * 5,
  })

  if (!data) return null

  return (
    <Card>
      <CardTitle className="mb-3">👥 Clientes</CardTitle>
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={data.total} icon="👤" colorClass="text-gray-700" />
        <StatCard label="Activos" value={data.active} icon="✅" colorClass="text-green-600" />
        <StatCard label="Inactivos" value={data.inactive} icon="💤" colorClass="text-gray-400" />
      </div>
    </Card>
  )
}

