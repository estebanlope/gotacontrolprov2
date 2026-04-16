import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { addDays } from 'date-fns'
import Card, { CardTitle } from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils'

interface Props { teamId: string }

export default function WeeklyCashFlow({ teamId }: Props) {
  const { data: weeks } = useQuery({
    queryKey: ['weekly-cashflow', teamId],
    queryFn: async () => {
      const today = new Date()
      const results: { label: string; expected: number; from: string; to: string }[] = []

      for (let i = 0; i < 4; i++) {
        const from = addDays(today, i * 7)
        const to = addDays(today, (i + 1) * 7 - 1)
        const fromStr = from.toISOString().split('T')[0]
        const toStr = to.toISOString().split('T')[0]

        const { data } = await supabase
          .from('loan_schedule')
          .select('amount, loans!inner(team_id, status)')
          .eq('loans.team_id', teamId)
          .neq('loans.status', 'paid')
          .eq('status', 'pending')
          .gte('due_date', fromStr)
          .lte('due_date', toStr)

        const expected = (data ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0)
        results.push({
          label: i === 0 ? 'Esta semana' : `Semana +${i}`,
          expected,
          from: fromStr,
          to: toStr,
        })
      }

      return results
    },
    enabled: !!teamId,
    staleTime: 1000 * 60 * 10,
  })

  if (!weeks) return null

  const maxVal = Math.max(...weeks.map(w => w.expected), 1)

  return (
    <Card>
      <CardTitle className="mb-3">📅 Flujo Semanal Esperado</CardTitle>
      <div className="space-y-3">
        {weeks.map(week => (
          <div key={week.from}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-gray-700">{week.label}</span>
              <span className="text-sm font-semibold">{formatCurrency(week.expected)}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${(week.expected / maxVal) * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{week.from} → {week.to}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

