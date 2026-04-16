import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatDate } from '@/lib/utils'
import { Plus } from 'lucide-react'
import type { User, Team, UserRole } from '@/types'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'cobrador', label: 'Cobrador' },
]

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: '🛡️ Super Admin',
  admin: '👑 Admin',
  cobrador: '🏍️ Cobrador',
}

export default function SuperAdminUsersPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', pin: '', role: 'cobrador' as UserRole, team_id: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: teams = [] } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('id, name').order('name')
      return (data ?? []) as Team[]
    },
  })

  const { data: users = [], isLoading } = useQuery<(User & { teams: { name: string } })[]>({
    queryKey: ['all-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*, teams(name)')
        .neq('role', 'superadmin')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as (User & { teams: { name: string } })[]
    },
  })

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.username.trim()) errs.username = 'Usuario requerido'
    if (form.pin.length !== 6 || !/^\d{6}$/.test(form.pin)) errs.pin = 'PIN de 6 dígitos requerido'
    if (!form.team_id) errs.team_id = 'Selecciona un equipo'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed')
      const { error } = await supabase.rpc('create_user', {
        p_id: uuidv4(),
        p_username: form.username.trim(),
        p_pin: form.pin,
        p_role: form.role,
        p_team_id: form.team_id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-users'] })
      setShowForm(false)
      setForm({ username: '', pin: '', role: 'cobrador', team_id: '' })
    }
  })

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const teamOptions = teams.map(t => ({ value: t.id, label: t.name }))

  return (
    <div>
      <PageHeader
        title="Usuarios"
        showLogout
        rightElement={
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus size={16} className="mr-1" />
            Nuevo
          </Button>
        }
      />

      <div className="p-4 space-y-4">
        {showForm && (
          <Card className="border-blue-200">
            <p className="font-semibold text-gray-900 mb-3">Nuevo Usuario</p>
            <div className="space-y-3">
              <Input label="Usuario *" value={form.username} onChange={e => set('username', e.target.value)} error={errors.username} placeholder="juan.cobrador" autoCapitalize="none" />
              <Input label="PIN (6 dígitos) *" type="password" inputMode="numeric" maxLength={6} value={form.pin} onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))} error={errors.pin} placeholder="••••••" />
              <Select label="Rol *" options={ROLE_OPTIONS} value={form.role} onChange={e => set('role', e.target.value as UserRole)} />
              <Select label="Equipo *" options={teamOptions} placeholder="Selecciona equipo" value={form.team_id} onChange={e => set('team_id', e.target.value)} error={errors.team_id} />
              {mutation.error && <p className="text-red-600 text-sm">Error al crear usuario.</p>}
              <div className="flex gap-2">
                <Button variant="secondary" fullWidth onClick={() => { setShowForm(false); setErrors({}) }}>Cancelar</Button>
                <Button fullWidth isLoading={mutation.isPending} onClick={() => mutation.mutate()}>Crear</Button>
              </div>
            </div>
          </Card>
        )}

        {isLoading && <div className="text-center py-12 text-gray-400">Cargando usuarios...</div>}

        {users.map(u => (
          <Card key={u.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{u.username}</p>
                <p className="text-xs text-gray-400">
                  {ROLE_LABELS[u.role]} · {u.teams?.name ?? '—'} · {formatDate(u.created_at)}
                </p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
              }`}>
                {u.role}
              </span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

