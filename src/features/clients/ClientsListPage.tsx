import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useClients } from './useClients'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { Search, Plus, User } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export default function ClientsListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: clients = [], isLoading } = useClients()
  const [search, setSearch] = useState('')

  const filtered = clients
    .filter(c =>
      c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      c.cedula.includes(search) ||
      c.phone.includes(search)
    )
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' }))

  return (
    <div>
      <PageHeader
        title="Clientes"
        showLogout
        rightElement={
          <Button size="sm" onClick={() => navigate('/clientes/nuevo')}>
            <Plus size={16} className="mr-1" />
            Nuevo
          </Button>
        }
      />

      <div className="p-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por nombre, cédula o teléfono..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12 text-gray-400">
            <div className="animate-spin text-3xl mb-2">⏳</div>
            <p>Cargando clientes...</p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <User size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">{search ? 'Sin resultados' : 'No hay clientes aún'}</p>
            <p className="text-sm mt-1">
              {search ? 'Intenta con otro término' : 'Crea el primer cliente'}
            </p>
          </div>
        )}

        {/* List */}
        {filtered.map(client => (
          <Card key={client.id} onClick={() => navigate(`/clientes/${client.id}`)}>
            <div className="flex items-center gap-3">
              {client.photo_url ? (
                <img
                  src={client.photo_url}
                  alt={client.full_name}
                  className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 font-bold text-lg">
                    {client.full_name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{client.full_name}</p>
                <p className="text-sm text-gray-500 truncate">CC {client.cedula} · {client.phone}</p>
                <p className="text-xs text-gray-400 mt-0.5">Creado {formatDate(client.created_at)}</p>
              </div>
              <svg className="w-5 h-5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Card>
        ))}

        <p className="text-center text-xs text-gray-400 py-2">
          {filtered.length} cliente{filtered.length !== 1 ? 's' : ''}
          {user?.role === 'cobrador' && ' (tus clientes)'}
        </p>
      </div>
    </div>
  )
}

