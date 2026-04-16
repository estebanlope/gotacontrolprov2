import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useClient } from './useClients'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { useAuth } from '@/context/AuthContext'
import type { Loan } from '@/types'
import { Pencil, Trash2 } from 'lucide-react'

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { data: client, isLoading } = useClient(id!)
  const isAdmin = user?.role === 'admin'
  const [photoOpen, setPhotoOpen] = useState(false)

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

  const { data: createdByUser } = useQuery<{ username: string } | null>({
    queryKey: ['user', client?.created_by],
    queryFn: async () => {
      if (!client?.created_by) return null
      const { data } = await supabase.from('users').select('username').eq('id', client.created_by).single()
      return data
    },
    enabled: isAdmin && !!client?.created_by,
  })

  const activeLoan = loans.find(l => l.status === 'active' || l.status === 'overdue' || l.status === 'pending')
  const hasActiveLoans = !!activeLoan

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('clients').delete().eq('id', id!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      navigate('/clientes', { replace: true })
    }
  })

  const handleDelete = () => {
    if (hasActiveLoans) {
      alert('No se puede eliminar un cliente con préstamos activos.')
      return
    }
    if (confirm(`¿Eliminar a ${client?.full_name}? Esta acción no se puede deshacer.`)) {
      deleteMutation.mutate()
    }
  }

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
      <PageHeader
        title="Detalle Cliente"
        showBack
        rightElement={
          isAdmin ? (
            <div className="flex items-center gap-1">
              <button onClick={() => navigate(`/clientes/${client.id}/editar`)} className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                <Pencil size={18} />
              </button>
              <button onClick={handleDelete} className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors" disabled={deleteMutation.isPending}>
                <Trash2 size={18} />
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="p-4 space-y-4">
        {/* Photo lightbox */}
        {photoOpen && client.photo_url && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
            onClick={() => setPhotoOpen(false)}
          >
            <img
              src={client.photo_url}
              alt={client.full_name}
              className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              onClick={() => setPhotoOpen(false)}
              className="absolute top-4 right-4 text-white bg-black/50 rounded-full w-9 h-9 flex items-center justify-center text-lg hover:bg-black/70"
            >
              ✕
            </button>
          </div>
        )}

        {/* Profile Card */}
        <Card>
          <div className="flex items-center gap-4">
            {client.photo_url ? (
              <img src={client.photo_url} alt={client.full_name}
                onClick={() => setPhotoOpen(true)}
                className="w-20 h-20 rounded-full object-cover flex-shrink-0 border-2 border-gray-100 cursor-zoom-in hover:opacity-90 transition-opacity" />
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
            {isAdmin && createdByUser && (
              <p className="text-xs text-gray-400">
                Creado por: <span className="font-medium text-gray-800">{createdByUser.username}</span>
              </p>
            )}
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

