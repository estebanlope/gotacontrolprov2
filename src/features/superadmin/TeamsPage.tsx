import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { formatDate } from '@/lib/utils'
import { Plus, Shield, Pencil } from 'lucide-react'
import type { Team } from '@/types'

const emptyForm = { name: '', telegram_bot_active: false, telegram_bot_token: '', telegram_bot_name: '', telegram_chat_id: '' }

export default function TeamsPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase.from('teams').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = 'Nombre requerido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed')
      const id = uuidv4()
      const { error } = await supabase.from('teams').insert({
        id,
        name: form.name.trim(),
        telegram_bot_active: form.telegram_bot_active,
        telegram_bot_token: form.telegram_bot_token.trim() || null,
        telegram_bot_name: form.telegram_bot_name.trim() || null,
        telegram_chat_id: form.telegram_chat_id.trim() || null,
      })
      if (error) throw error
      // Create default config for the team
      await supabase.from('config').insert({
        id: uuidv4(),
        team_id: id,
        capital_base: 0,
        default_interest_rate: 20,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setShowForm(false)
      setForm({ ...emptyForm })
    }
  })

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!validate() || !editingTeam) throw new Error('Validation failed')
      const { error } = await supabase.from('teams').update({
        name: form.name.trim(),
        telegram_bot_active: form.telegram_bot_active,
        telegram_bot_token: form.telegram_bot_token.trim() || null,
        telegram_bot_name: form.telegram_bot_name.trim() || null,
        telegram_chat_id: form.telegram_chat_id.trim() || null,
      }).eq('id', editingTeam.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      setEditingTeam(null)
      setForm({ ...emptyForm })
    }
  })

  const startEdit = (team: Team) => {
    setEditingTeam(team)
    setShowForm(false)
    setForm({
      name: team.name,
      telegram_bot_active: team.telegram_bot_active ?? false,
      telegram_bot_token: team.telegram_bot_token ?? '',
      telegram_bot_name: team.telegram_bot_name ?? '',
      telegram_chat_id: team.telegram_chat_id ?? '',
    })
  }

  const cancelForm = () => { setShowForm(false); setEditingTeam(null); setForm({ ...emptyForm }) }

  const toggleTelegram = async (team: Team) => {
    await supabase.from('teams').update({ telegram_bot_active: !team.telegram_bot_active }).eq('id', team.id)
    queryClient.invalidateQueries({ queryKey: ['teams'] })
  }

  const isEdit = !!editingTeam
  const showAnyForm = showForm || isEdit

  return (
    <div>
      <PageHeader
        title="Equipos"
        showLogout
        rightElement={
          <Button size="sm" onClick={() => { setShowForm(true); setEditingTeam(null); setForm({ ...emptyForm }) }}>
            <Plus size={16} className="mr-1" /> Nuevo
          </Button>
        }
      />
      <div className="p-4 space-y-4">
        {showAnyForm && (
          <Card className="border-blue-200">
            <p className="font-semibold text-gray-900 mb-3">{isEdit ? `Editar: ${editingTeam?.name}` : 'Nuevo Equipo'}</p>
            <div className="space-y-3">
              <Input label="Nombre del equipo *" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} error={errors.name} placeholder="Equipo Bogotá" />
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.telegram_bot_active} onChange={e => setForm(p => ({ ...p, telegram_bot_active: e.target.checked }))} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">Activar bot de Telegram</span>
              </label>
              {form.telegram_bot_active && (
                <>
                  <Input label="Token del bot" value={form.telegram_bot_token} onChange={e => setForm(p => ({ ...p, telegram_bot_token: e.target.value }))} placeholder="1234567890:ABCdef..." />
                  <Input label="Nombre del bot" value={form.telegram_bot_name} onChange={e => setForm(p => ({ ...p, telegram_bot_name: e.target.value }))} placeholder="@mi_bot" />
                  <Input label="Chat ID" value={form.telegram_chat_id} onChange={e => setForm(p => ({ ...p, telegram_chat_id: e.target.value }))} placeholder="-1001234567890" />
                </>
              )}
              {(createMutation.error || editMutation.error) && (
                <p className="text-red-600 text-sm">Error al guardar. Intenta de nuevo.</p>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" fullWidth onClick={cancelForm}>Cancelar</Button>
                <Button fullWidth isLoading={isEdit ? editMutation.isPending : createMutation.isPending} onClick={() => isEdit ? editMutation.mutate() : createMutation.mutate()}>
                  {isEdit ? 'Guardar cambios' : 'Crear'}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {isLoading && <div className="text-center py-12 text-gray-400">Cargando equipos...</div>}

        {!isLoading && teams.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            <Shield size={40} className="mx-auto mb-3 opacity-30" />
            <p>Sin equipos creados</p>
          </div>
        )}

        {teams.map(team => (
          <Card key={team.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{team.name}</p>
                <p className="text-xs text-gray-400">Creado {formatDate(team.created_at)}</p>
                {team.telegram_bot_name && (
                  <p className="text-xs text-blue-600 mt-0.5">🤖 {team.telegram_bot_name}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => startEdit(team)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  title="Editar equipo"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => toggleTelegram(team)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    team.telegram_bot_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {team.telegram_bot_active ? '🟢 Telegram ON' : '⚫ Telegram OFF'}
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

