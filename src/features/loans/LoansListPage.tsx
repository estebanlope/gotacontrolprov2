import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLoans } from './useLoans'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDate, formatCurrency } from '@/lib/utils'
import { loanStatusLabel, loanStatusColors, paymentTypeLabel } from '@/lib/loanCalculations'
import type { LoanStatus } from '@/types'
import { Plus, DollarSign } from 'lucide-react'

const STATUS_FILTERS: { value: LoanStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'overdue', label: 'En mora' },
  { value: 'pending', label: 'Sin iniciar' },
  { value: 'paid', label: 'Pagados' },
]

export default function LoansListPage() {
  const navigate = useNavigate()
  const { data: loans = [], isLoading } = useLoans()
  const [statusFilter, setStatusFilter] = useState<LoanStatus | 'all'>('all')

  const filtered = loans.filter(l => statusFilter === 'all' || l.status === statusFilter)

  return (
    <div>
      <PageHeader
        title="Préstamos"
        showLogout
        rightElement={
          <Button size="sm" onClick={() => navigate('/prestamos/nuevo')}>
            <Plus size={16} className="mr-1" />
            Nuevo
          </Button>
        }
      />

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

        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <DollarSign size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">Sin préstamos {statusFilter !== 'all' ? 'en este estado' : ''}</p>
          </div>
        )}

        {filtered.map(loan => (
          <Card key={loan.id} onClick={() => navigate(`/prestamos/${loan.id}`)}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${loanStatusColors(loan.status)}`}>
                    {loanStatusLabel(loan.status)}
                  </span>
                  <span className="text-xs text-gray-400">{paymentTypeLabel(loan.payment_type)}</span>
                </div>
                <p className="font-bold text-gray-900 text-lg">{formatCurrency(loan.capital)}</p>
                <p className="text-xs text-gray-500">
                  Interés: {loan.interest_rate}% · Total: {formatCurrency(loan.capital * (1 + loan.interest_rate / 100))}
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
        ))}

        <p className="text-center text-xs text-gray-400 py-2">
          {filtered.length} préstamo{filtered.length !== 1 ? 's' : ''}
        </p>
      </div>
    </div>
  )
}

