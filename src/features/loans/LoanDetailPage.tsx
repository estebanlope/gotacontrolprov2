import { useParams, useNavigate } from 'react-router-dom'
import { useLoan, useLoanSchedule } from './useLoans'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import Card, { CardTitle } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { formatDate, formatCurrency } from '@/lib/utils'
import { loanStatusLabel, loanStatusColors, paymentTypeLabel } from '@/lib/loanCalculations'
import { useAuth } from '@/context/AuthContext'
import type { Client, Payment } from '@/types'
import { CheckCircle, Circle, Trash2, Pencil } from 'lucide-react'

export default function LoanDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: loan, isLoading } = useLoan(id!)
  const { data: schedule = [] } = useLoanSchedule(id!)
  const isAdmin = user?.role === 'admin'

  const { data: client } = useQuery<Client | null>({
    queryKey: ['client', loan?.client_id],
    queryFn: async () => {
      if (!loan?.client_id) return null
      const { data } = await supabase.from('clients').select('*').eq('id', loan.client_id).single()
      return data
    },
    enabled: !!loan?.client_id,
  })

  const { data: payments = [] } = useQuery<Payment[]>({
    queryKey: ['loan-payments', id],
    queryFn: async () => {
      const { data } = await supabase.from('payments').select('*').eq('loan_id', id!).order('payment_date', { ascending: false })
      return data ?? []
    },
    enabled: !!id,
  })

  const deleteLoanMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('loan_schedule').delete().eq('loan_id', id!)
      await supabase.from('payments').delete().eq('loan_id', id!)
      const { error } = await supabase.from('loans').delete().eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      navigate('/prestamos', { replace: true })
    }
  })

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from('payments').delete().eq('id', paymentId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-payments', id] })
      queryClient.invalidateQueries({ queryKey: ['loans'] })
      queryClient.invalidateQueries({ queryKey: ['payments'] })
    }
  })

  const handleDeleteLoan = () => {
    if (confirm('¿Eliminar este préstamo? Se eliminarán también sus pagos y cuotas. Esta acción no se puede deshacer.')) {
      deleteLoanMutation.mutate()
    }
  }

  const handleDeletePayment = (paymentId: string, amount: number) => {
    if (confirm(`¿Eliminar el pago de ${formatCurrency(amount)}? Esta acción no se puede deshacer.`)) {
      deletePaymentMutation.mutate(paymentId)
    }
  }

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
  const totalExpected = loan ? loan.capital + loan.capital * (loan.interest_rate / 100) : 0
  const progressPct = totalExpected > 0 ? Math.min(100, (totalPaid / totalExpected) * 100) : 0
  const paidCount = schedule.filter(s => s.status === 'paid').length

  if (isLoading) return (
    <div><PageHeader title="Préstamo" showBack /><div className="p-4 text-center text-gray-400 py-12">Cargando...</div></div>
  )
  if (!loan) return (
    <div><PageHeader title="Préstamo" showBack /><div className="p-4 text-center text-gray-400 py-12">Préstamo no encontrado</div></div>
  )

  return (
    <div>
      <PageHeader title="Detalle Préstamo" showBack />
      <div className="p-4 space-y-4">

        {/* Status + Client */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${loanStatusColors(loan.status)}`}>
                {loanStatusLabel(loan.status)}
              </span>
              {client && (
                <button
                  onClick={() => navigate(`/clientes/${client.id}`)}
                  className="block mt-2 text-base font-semibold text-blue-700 hover:underline"
                >
                  {client.full_name}
                </button>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(loan.capital)}</p>
              <p className="text-xs text-gray-400">{loan.interest_rate}% interés</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-sm border-t border-gray-100 pt-3">
            <div><p className="text-xs text-gray-400">Tipo de pago</p><p className="font-medium">{paymentTypeLabel(loan.payment_type)}</p></div>
            <div><p className="text-xs text-gray-400">Plazo</p><p className="font-medium">{loan.term_weeks} semanas</p></div>
            <div><p className="text-xs text-gray-400">Desembolso</p><p className="font-medium">{formatDate(loan.disbursement_date)}</p></div>
            <div><p className="text-xs text-gray-400">Vencimiento</p><p className="font-medium">{formatDate(loan.due_date)}</p></div>
            {loan.next_payment_date && loan.status !== 'paid' && (
              <div className="col-span-2">
                <p className="text-xs text-gray-400">Próximo pago</p>
                <p className={`font-medium ${loan.status === 'overdue' ? 'text-red-600' : 'text-blue-600'}`}>
                  {formatDate(loan.next_payment_date)}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Progress */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <CardTitle>Progreso de pago</CardTitle>
            <span className="text-sm font-semibold text-blue-600">{progressPct.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
            <div
              className="bg-blue-500 h-3 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Pagado: {formatCurrency(totalPaid)} ({paidCount}/{schedule.length} cuotas)</span>
            <span>Pendiente: {formatCurrency(Math.max(0, totalExpected - totalPaid))}</span>
          </div>
        </Card>

        {/* Register Payment button */}
        {loan.status !== 'paid' && (
          <Button fullWidth onClick={() => navigate(`/pagos/nuevo?loan_id=${loan.id}`)}>
            💳 Registrar Pago
          </Button>
        )}

        {/* Admin actions */}
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => navigate(`/prestamos/${loan.id}/editar`)}>
              ✏️ Editar Préstamo
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={handleDeleteLoan}
              isLoading={deleteLoanMutation.isPending}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              🗑️ Eliminar
            </Button>
          </div>
        )}

        {/* Schedule */}
        <Card>
          <CardTitle className="mb-3">📅 Tabla de cuotas ({schedule.length})</CardTitle>
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {schedule.map((entry, idx) => (
              <div
                key={entry.id}
                className={`flex items-center justify-between py-2 px-2 rounded-lg ${
                  entry.status === 'paid' ? 'bg-green-50' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {entry.status === 'paid'
                    ? <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                    : <Circle size={16} className="text-gray-300 flex-shrink-0" />
                  }
                  <div>
                    <p className="text-xs font-medium text-gray-700">Cuota {idx + 1}</p>
                    <p className="text-xs text-gray-400">{formatDate(entry.due_date)}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${entry.status === 'paid' ? 'text-green-700' : 'text-gray-900'}`}>
                  {formatCurrency(entry.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Payments history */}
        {payments.length > 0 && (
          <Card>
            <CardTitle className="mb-3">💳 Pagos realizados ({payments.length})</CardTitle>
            <div className="space-y-2">
              {payments.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-gray-400">
                      {formatDate(p.payment_date)} · {p.method === 'cash' ? '💵 Efectivo' : '🔄 Transferencia'}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => navigate(`/pagos/${p.id}/editar`)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleDeletePayment(p.id, p.amount)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
