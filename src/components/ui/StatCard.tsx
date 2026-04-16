import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  icon?: string
  sub?: string
  colorClass?: string
}

export default function StatCard({ label, value, icon, sub, colorClass = 'text-blue-600' }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide truncate">{label}</p>
          <p className={cn('text-base sm:text-2xl font-bold mt-1 truncate', colorClass)}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
        </div>
        {icon && <span className="text-lg sm:text-2xl flex-shrink-0">{icon}</span>}
      </div>
    </div>
  )
}
