import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { formatDate, formatCurrency } from '@/lib/utils'
import { Plus, Users, Settings, Edit2, X } from 'lucide-react'
import type { User, UserRole, Config } from '@/types'

const ROLE_OPTIONS = [
  { value: 'cobrador', label: 'Cobrador' },
  { value: 'admin', label: 'Admin' },
]

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: '🛡️ Super Admin',
  admin: '👑 Admin',
  cobrador: '🏍️ Cobrador',
}

const MIN_BALANCE = 100000

export default function UsersPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', pin: '', role: 'cobrador' as UserRole, balance: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [capitalBaseInput, setCapitalBaseInput] = useState('')
  const [editingCapital, setEditingCapital] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ username: '', pin: '', role: 'cobrador' as UserRole, balance: '' })
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['team-users', user?.team_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('team_id', user!.team_id!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!user?.team_id,
  })

  const { data: config } = useQuery<Config | null>({
    queryKey: ['config', user?.team_id],
    queryFn: async () => {
      const { data } = await supabase.from('config').select('*').eq('team_id', user!.team_id!).single()
      return data
    },
    enabled: !!user?.team_id,
  })

  const totalBalance = users.reduce((sum, u) => sum + u.balance, 0)
  const availableBalance = (config?.capital_base ?? 0) - totalBalance

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.username.trim()) errs.username = 'Usuario requerido'
    if (form.pin.length !== 6 || !/^\d{6}$/.test(form.pin)) errs.pin = 'PIN debe ser exactamente 6 dígitos'
    const balance = parseFloat(form.balance)
    if (isNaN(balance) || balance < MIN_BALANCE) errs.balance = `Saldo mínimo es ${formatCurrency(MIN_BALANCE)}`
    if (balance > availableBalance) errs.balance = `Saldo excede el capital base disponible. Disponible: ${formatCurrency(availableBalance)}`
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const validateEdit = () => {
    const errs: Record<string, string> = {}
    if (!editForm.username.trim()) errs.username = 'Usuario requerido'
    const balance = parseFloat(editForm.balance)
    const currentBalance = editingUser?.balance ?? 0
    const balanceDiff = balance - currentBalance
    if (isNaN(balance) || balance < MIN_BALANCE) errs.balance = `Saldo mínimo es ${formatCurrency(MIN_BALANCE)}`
    if (balanceDiff > availableBalance) errs.balance = `Saldo excede el capital base disponible. Disponible: ${formatCurrency(availableBalance)}`
    setEditErrors(errs)
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
        p_team_id: user!.team_id!,
        p_balance: parseFloat(form.balance),
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] })
      setShowForm(false)
      setForm({ username: '', pin: '', role: 'cobrador', balance: '' })
    }
  })

  const capitalMutation = useMutation({
    mutationFn: async () => {
      const value = parseFloat(capitalBaseInput)
      if (isNaN(value) || value < 0) throw new Error('Valor inválido')
      const { error } = await supabase
        .from('config')
        .update({ capital_base: value })
        .eq('team_id', user!.team_id!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', user?.team_id] })
      queryClient.invalidateQueries({ queryKey: ['capital-position'] })
      setEditingCapital(false)
    }
  })

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!validateEdit()) throw new Error('Validation failed')
      const updates: Record<string, unknown> = {
        username: editForm.username.trim(),
        role: editForm.role,
        balance: parseFloat(editForm.balance),
      }
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', editingUser!.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-users'] })
      setEditingUser(null)
      setEditForm({ username: '', pin: '', role: 'cobrador', balance: '' })
    }
  })

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const setEdit = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
    setEditErrors(prev => ({ ...prev, [field]: '' }))
  }

  const openEditModal = (u: User) => {
    setEditingUser(u)
    setEditForm({
      username: u.username,
      pin: '',
      role: u.role,
      balance: String(u.balance)
    })
    setEditErrors({})
  }

  return (
    <div>
      <PageHeader
        title="Usuarios"
        showLogout
        rightElement={
          user?.role === 'admin' && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus size={16} className="mr-1" />
              Nuevo
            </Button>
          )
        }
      />

      <div className="p-4 space-y-4">

        {/* Capital Base config */}
        <Card className="border-blue-100 bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Settings size={16} className="text-blue-600" />
              <p className="text-sm font-semibold text-blue-900">Capital Base del Equipo</p>
            </div>
            {!editingCapital && user?.role === 'admin' && (
              <button
                onClick={() => { setCapitalBaseInput(String(config?.capital_base ?? 0)); setEditingCapital(true) }}
                className="text-xs text-blue-600 font-medium hover:underline"
              >
                Editar
              </button>
            )}
          </div>
          {editingCapital ? (
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  label="Nuevo capital base"
                  type="number"
                  inputMode="decimal"
                  value={capitalBaseInput}
                  onChange={e => setCapitalBaseInput(e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
              <Button size="sm" isLoading={capitalMutation.isPending} onClick={() => capitalMutation.mutate()}>
                Guardar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditingCapital(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <>
              <p className="text-2xl font-bold text-blue-700">{formatCurrency(config?.capital_base ?? 0)}</p>
              <p className="text-xs text-blue-600 mt-1">Total asignado: {formatCurrency(totalBalance)} | Disponible: {formatCurrency(availableBalance)}</p>
            </>
          )}
          {capitalMutation.error && <p className="text-red-600 text-xs mt-1">Error al guardar. Intenta de nuevo.</p>}
        </Card>

        {/* New user form */}
        {showForm && (
          <Card className="border-blue-200">
            <p className="font-semibold text-gray-900 mb-3">Nuevo Usuario</p>
            <div className="space-y-3">
              <Input label="Usuario *" value={form.username} onChange={e => set('username', e.target.value)} error={errors.username} placeholder="juan.cobrador" autoCapitalize="none" />
              <Input label="PIN (6 dígitos) *" type="password" inputMode="numeric" maxLength={6} value={form.pin} onChange={e => set('pin', e.target.value.replace(/\D/g, '').slice(0, 6))} error={errors.pin} placeholder="••••••" />
              <Select label="Rol *" options={ROLE_OPTIONS} value={form.role} onChange={e => set('role', e.target.value as UserRole)} />
              <Input
                label={`Saldo inicial *`}
                type="number"
                inputMode="decimal"
                value={form.balance}
                onChange={e => set('balance', e.target.value)}
                error={errors.balance}
                placeholder={String(MIN_BALANCE)}
                min={String(MIN_BALANCE)}
              />
              {mutation.error && (
                <p className="text-red-600 text-sm">
                  {(mutation.error as Error).message !== 'Validation failed'
                    ? 'Error al crear usuario. El nombre puede estar en uso.'
                    : ''}
                </p>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" fullWidth onClick={() => { setShowForm(false); setErrors({}) }}>Cancelar</Button>
                <Button fullWidth isLoading={mutation.isPending} onClick={() => mutation.mutate()}>Crear</Button>
              </div>
            </div>
          </Card>
        )}

        {isLoading && (
          <div className="text-center py-12 text-gray-400">Cargando usuarios...</div>
        )}

        {!isLoading && users.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p>Sin usuarios en el equipo</p>
          </div>
        )}

        {users.map(u => (
          <Card key={u.id}>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{u.username}</p>
                <p className="text-xs text-gray-400">{ROLE_LABELS[u.role]} · Creado {formatDate(u.created_at)}</p>
                <p className="text-sm font-semibold text-blue-700 mt-1">Saldo: {formatCurrency(u.balance)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                  u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                }`}>
                  {u.role}
                </span>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => openEditModal(u)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition"
                  >
                    <Edit2 size={16} className="text-gray-600" />
                  </button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-4 max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-4 flex items-center justify-between flex-shrink-0 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Editar Usuario</h2>
              <button
                onClick={() => setEditingUser(null)}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <Input
                label="Usuario *"
                value={editForm.username}
                onChange={e => setEdit('username', e.target.value)}
                error={editErrors.username}
                placeholder="juan.cobrador"
                autoCapitalize="none"
              />
              <Select
                label="Rol *"
                options={ROLE_OPTIONS}
                value={editForm.role}
                onChange={e => setEdit('role', e.target.value as UserRole)}
              />
              <Input
                label={`Saldo *`}
                type="number"
                inputMode="decimal"
                value={editForm.balance}
                onChange={e => setEdit('balance', e.target.value)}
                error={editErrors.balance}
                placeholder={String(MIN_BALANCE)}
                min={String(MIN_BALANCE)}
              />

              {editMutation.error && (
                <p className="text-red-600 text-sm">
                  {(editMutation.error as Error).message !== 'Validation failed'
                    ? 'Error al guardar. Intenta de nuevo.'
                    : ''}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="secondary" fullWidth onClick={() => setEditingUser(null)}>Cancelar</Button>
                <Button fullWidth isLoading={editMutation.isPending} onClick={() => editMutation.mutate()}>Guardar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

