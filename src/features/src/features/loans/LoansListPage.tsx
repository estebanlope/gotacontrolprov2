import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoans } from './useLoans'
import RouteModal, { getRouteOrder } from './RouteModal'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDate, formatCurrency, todayISO } from '@/lib/utils'
import { loanStatusLabel, loanStatusColors, paymentTypeLabel, calcNumInstallments } from '@/lib/loanCalculations'
import type { LoanStatus } from '@/types'
import { Plus, DollarSign, MapPin } from 'lucide-react'

const STATUS_FILTERS: { value: LoanStatus | 'all' | 'today'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'today', label: '📅 Hoy' },
  { value: 'active', label: 'Activos' },
  { value: 'overdue', label: 'En mora' },
  { value: 'pending', label: 'Sin iniciar' },
  { value: 'paid', label: 'Pagados' },
]

export default function LoansListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data: loans = [], isLoading } = useLoans()
  const [statusFilter, setStatusFilter] = useState<LoanStatus | 'all' | 'today'>('today')
  const [showRoute, setShowRoute] = useState(false)

  const today = todayISO()
  const filtered = loans.filter(l => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'today') return !!l.next_payment_date && l.next_payment_date <= today
    return l.status === statusFilter
  })

  // Apply route order when filter is 'today'
  const sortedFiltered = statusFilter === 'today' && user?.id
    ? (() => {
        const order = getRouteOrder(user.id)
        if (order.length === 0) return filtered
        const ordered = order.map(id => filtered.find(l => l.id === id)).filter(Boolean) as typeof filtered
        const rest = filtered.filter(l => !order.includes(l.id))
        return [...ordered, ...rest]
      })()
    : filtered

  return (
    <div>
      <PageHeader
        title="Préstamos"
        showLogout
        rightElement={
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setShowRoute(true)}>
              <MapPin size={15} className="mr-1" />
              Ruta
            </Button>
            <Button size="sm" onClick={() => navigate('/prestamos/nuevo')}>
              <Plus size={16} className="mr-1" />
              Nuevo
            </Button>
          </div>
        }
      />

      {showRoute && user && (
        <RouteModal
          userId={user.id}
          loans={loans}
          onClose={() => setShowRoute(false)}
        />
      )}

      <div className="p-4 space-y-4">
        {/* Status filter pills */}
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="text-center py-12 text-gray-400">
            <div className="animate-spin text-3xl mb-2">⏳</div>
            <p>Cargando préstamos...</p>
          </div>
        )}

        {!isLoading && sortedFiltered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <DollarSign size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin préstamos {statusFilter !== 'all' ? 'en este estado' : ''}</p>
          </div>
        )}

        {sortedFiltered.map((loan, index) => {
          const totalAmount = loan.capital * (1 + loan.interest_rate / 100)
          const numInstallments = calcNumInstallments(loan.payment_type, loan.term_weeks)
          const installment = numInstallments > 0 ? totalAmount / numInstallments : 0

          const borderColor =
            loan.status === 'paid'
              ? 'border-l-4 border-l-green-500'
              : loan.status === 'overdue' || (loan.next_payment_date && loan.next_payment_date < today)
              ? 'border-l-4 border-l-orange-500'
              : 'border-l-4 border-l-blue-500'

          return (
          <Card key={loan.id} onClick={() => navigate(`/prestamos/${loan.id}`)} className={borderColor}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {statusFilter === 'today' && (
                    <span className="text-xs font-bold text-gray-300">#{index + 1}</span>
                  )}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${loanStatusColors(loan.status)}`}>
                    {loanStatusLabel(loan.status)}
                  </span>
                  <span className="text-xs text-gray-400">{paymentTypeLabel(loan.payment_type)}</span>
                </div>
                {loan.client_name && (
                  <p className="text-sm font-semibold text-gray-700 truncate mb-0.5">👤 {loan.client_name}</p>
                )}
                <p className="font-bold text-gray-900 text-lg">{formatCurrency(loan.capital)}</p>
                <p className="text-xs text-gray-500">
                  Interés: {loan.interest_rate}% · Total: {formatCurrency(totalAmount)} · Cuota: {formatCurrency(installment)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Desembolso: {formatDate(loan.disbursement_date)} · Vence: {formatDate(loan.due_date)}
                </p>
                {loan.next_payment_date && loan.status !== 'paid' && (
                  <p className={`text-xs mt-0.5 font-medium ${loan.status === 'overdue' ? 'text-red-600' : 'text-blue-600'}`}>
                    Próximo pago: {formatDate(loan.next_payment_date)}
                  </p>
                )}
              </div>
              <svg className="w-5 h-5 text-gray-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Card>
          )
        })}

        <p className="text-center text-xs text-gray-400 py-2">
          {sortedFiltered.length} préstamo{sortedFiltered.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}
