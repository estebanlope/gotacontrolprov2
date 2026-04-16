import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Card, { CardTitle } from '@/components/ui/Card'

interface Props { teamId: string }

const STATUS_LABELS: Record<string, string> = {
  pending: '🟡 Sin iniciar',
  active: '🔵 Activos',
  overdue: '🔴 En mora',
  paid: '🟢 Pagados',
}

const TYPE_LABELS: Record<string, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
}

export default function PortfolioStatus({ teamId }: Props) {
  const { data } = useQuery({
    queryKey: ['portfolio-status', teamId],
    queryFn: async () => {
      const { data: loans } = await supabase
        .from('loans')
        .select('status, payment_type, capital')
        .eq('team_id', teamId)

      if (!loans) return null

      const byStatus: Record<string, number> = {}
      const byType: Record<string, number> = {}

      for (const l of loans) {
        byStatus[l.status] = (byStatus[l.status] ?? 0) + 1
        if (l.status !== 'paid') {
          byType[l.payment_type] = (byType[l.payment_type] ?? 0) + 1
        }
      }

      return { byStatus, byType, total: loans.length }
    },
    enabled: !!teamId,
    staleTime: 1000 * 60 * 5,
  })

  if (!data) return null

  return (
    <Card>
      <CardTitle className="mb-3">📊 Estado de Cartera</CardTitle>

      <div className="space-y-2 mb-4">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Por Estado</p>
        {Object.entries(data.byStatus).map(([status, count]) => (
          <div key={status} className="flex items-center justify-between">
            <span className="text-sm">{STATUS_LABELS[status] ?? status}</span>
            <span className="font-semibold text-sm">{count} préstamo{count !== 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t border-gray-100 pt-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Frecuencia de Pago (Activos)</p>
        {Object.entries(data.byType).map(([type, count]) => (
          <div key={type} className="flex items-center justify-between">
            <span className="text-sm text-gray-700">{TYPE_LABELS[type] ?? type}</span>
            <span className="font-semibold text-sm">{count}</span>
          </div>
        ))}
        {Object.keys(data.byType).length === 0 && (
          <p className="text-sm text-gray-400">Sin préstamos activos</p>
        )}
      </div>
    </Card>
  )
}

