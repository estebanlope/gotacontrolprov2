import { useParams, useNavigate } from 'react-router-dom'
import { useClient } from './useClients'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import PageHeader from '@/components/layout/PageHeader'
import Card, { CardTitle, CardSubtitle } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { formatDate, formatCurrency } from '@/lib/utils'
import { loanStatusLabel, loanStatusColors } from '@/lib/loanCalculations'
import type { Loan } from '@/types'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: client, isLoading } = useClient(id!)

  const { data: loans = [] } = useQuery<Loan[]>({
    queryKey: ['client-loans', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .eq('client_id', id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!id,
  })

  const activeLoan = loans.find(l => l.status === 'active' || l.status === 'overdue' || l.status === 'pending')

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Cliente" showBack />
        <div className="p-4 text-center text-gray-400 py-12">Cargando...</div>
      </div>
    )
  }

  if (!client) {
    return (
      <div>
        <PageHeader title="Cliente" showBack />
        <div className="p-4 text-center text-gray-400 py-12">Cliente no encontrado</div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Detalle Cliente" showBack />

      <div className="p-4 space-y-4">
        {/* Profile Card */}
        <Card>
          <div className="flex items-center gap-4">
            {client.photo_url ? (
              <img src={client.photo_url} alt={client.full_name}
                className="w-20 h-20 rounded-full object-cover flex-shrink-0 border-2 border-gray-100" />
            ) : (
              <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                <span className="text-blue-600 font-bold text-3xl">
                  {client.full_name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <CardTitle>{client.full_name}</CardTitle>
              <CardSubtitle>CC {client.cedula}</CardSubtitle>
              <p className="text-sm text-gray-600 mt-1">📱 {client.phone}</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Dirección:</span> {client.address}
            </p>
            {client.notes && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">Notas:</span> {client.notes}
              </p>
            )}
            <p className="text-xs text-gray-400">Registrado el {formatDate(client.created_at)}</p>
          </div>
        </Card>

        {/* Map */}
        {client.lat && client.lng && (
          <Card>
            <CardTitle className="mb-3">📍 Ubicación</CardTitle>
            <div className="rounded-xl overflow-hidden border border-gray-200 h-48">
              <MapContainer
                center={[client.lat, client.lng]}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[client.lat, client.lng]} />
              </MapContainer>
            </div>
          </Card>
        )}

        {/* Active Loan */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <CardTitle>Préstamo Activo</CardTitle>
            {!activeLoan && (
              <Button size="sm" onClick={() => navigate(`/prestamos/nuevo?client_id=${client.id}`)}>
                Nuevo Préstamo
              </Button>
            )}
          </div>

          {activeLoan ? (
            <div
              className="cursor-pointer"
              onClick={() => navigate(`/prestamos/${activeLoan.id}`)}
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${loanStatusColors(activeLoan.status)}`}>
                  {loanStatusLabel(activeLoan.status)}
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  {formatCurrency(activeLoan.capital)}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Vence: {formatDate(activeLoan.due_date)}
              </p>
              {activeLoan.next_payment_date && (
                <p className="text-sm text-gray-600">
                  Próximo pago: {formatDate(activeLoan.next_payment_date)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin préstamo activo</p>
          )}
        </Card>

        {/* Loan History */}
        {loans.length > 0 && (
          <Card>
            <CardTitle className="mb-3">Historial de Préstamos</CardTitle>
            <div className="space-y-2">
              {loans.map(loan => (
                <div
                  key={loan.id}
                  onClick={() => navigate(`/prestamos/${loan.id}`)}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 -mx-1 px-1 rounded"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatCurrency(loan.capital)}</p>
                    <p className="text-xs text-gray-400">{formatDate(loan.disbursement_date)}</p>
                  </div>
                  <Badge className={loanStatusColors(loan.status)}>
                    {loanStatusLabel(loan.status)}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

