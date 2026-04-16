import { useState, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { v4 as uuidv4 } from 'uuid'
import imageCompression from 'browser-image-compression'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { enqueueSync } from '@/lib/syncQueue'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import type { Client } from '@/types'

// Fix Leaflet default marker icon
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function MapPicker({ lat, lng, onChange }: {
  lat: number | null
  lng: number | null
  onChange: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onChange(e.latlng.lat, e.latlng.lng)
    }
  })
  if (lat === null || lng === null) return null
  return <Marker position={[lat, lng]} />
}

export default function ClientForm() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id

  const { data: existingClient } = useQuery<Client | null>({
    queryKey: ['client', id],
    queryFn: async () => {
      if (!id) return null
      const { data } = await supabase.from('clients').select('*').eq('id', id).single()
      return data
    },
    enabled: isEdit,
  })

  const [form, setForm] = useState({
    full_name: '',
    cedula: '',
    phone: '',
    address: '',
    notes: '',
  })
  const [lat, setLat] = useState<number | null>(4.711)
  const [lng, setLng] = useState<number | null>(-74.0721)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (existingClient && !initialized) {
      setForm({
        full_name: existingClient.full_name,
        cedula: existingClient.cedula,
        phone: existingClient.phone,
        address: existingClient.address,
        notes: existingClient.notes ?? '',
      })
      setLat(existingClient.lat)
      setLng(existingClient.lng)
      setPhotoPreview(existingClient.photo_url)
      setInitialized(true)
    }
  }, [existingClient, initialized])

  const set = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const compressed = await imageCompression(file, {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 800,
      useWebWorker: true,
      initialQuality: 0.75,
    })
    setPhotoFile(compressed)
    setPhotoPreview(URL.createObjectURL(compressed))
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!form.full_name.trim()) errs.full_name = 'Nombre requerido'
    if (!form.cedula.trim()) errs.cedula = 'Cédula requerida'
    if (!form.phone.trim()) errs.phone = 'Teléfono requerido'
    if (!form.address.trim()) errs.address = 'Dirección requerida'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('Validation failed')

      const clientId = isEdit ? id! : uuidv4()
      let photo_url: string | null = existingClient?.photo_url ?? null

      // Upload photo if present and online
      if (photoFile && navigator.onLine) {
        const ext = photoFile.name.split('.').pop()
        const path = `${user!.team_id}/${clientId}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('client-photos')
          .upload(path, photoFile, { upsert: true })
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('client-photos').getPublicUrl(path)
          photo_url = urlData.publicUrl
        }
      }

      const clientData: Client = {
        id: clientId,
        team_id: user!.team_id!,
        created_by: isEdit ? (existingClient?.created_by ?? user!.id) : user!.id,
        full_name: form.full_name.trim(),
        cedula: form.cedula.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        lat,
        lng,
        notes: form.notes.trim() || null,
        photo_url,
        created_at: isEdit ? (existingClient?.created_at ?? new Date().toISOString()) : new Date().toISOString(),
      }

      // Save locally always
      await db.clients.put({ ...clientData, synced: false })

      if (navigator.onLine) {
        const { error } = await supabase.from('clients').upsert(clientData)
        if (error) throw error
        await db.clients.update(clientId, { synced: true })
      } else {
        await enqueueSync('clients', clientId, isEdit ? 'update' : 'insert', clientData as unknown as Record<string, unknown>)
      }

      return clientData
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      if (isEdit) queryClient.invalidateQueries({ queryKey: ['client', id] })
      navigate(-1)
    }
  })

  return (
    <div>
      <PageHeader title={isEdit ? 'Editar Cliente' : 'Nuevo Cliente'} showBack />

      <form
        className="p-4 space-y-4"
        onSubmit={e => { e.preventDefault(); mutation.mutate() }}
      >
        {/* Photo */}
        <div className="flex flex-col items-center gap-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer overflow-hidden hover:border-blue-400 transition-colors"
          >
            {photoPreview ? (
              <img src={photoPreview} alt="preview" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl">📷</span>
            )}
          </div>
          <p className="text-xs text-gray-400">Toca para {isEdit ? 'cambiar' : 'agregar'} foto</p>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
        </div>

        <Input label="Nombre completo *" value={form.full_name} onChange={e => set('full_name', e.target.value)} error={errors.full_name} placeholder="Juan Carlos Pérez" />
        <Input label="Cédula *" value={form.cedula} onChange={e => set('cedula', e.target.value)} error={errors.cedula} placeholder="1234567890" inputMode="numeric" />
        <Input label="Teléfono *" value={form.phone} onChange={e => set('phone', e.target.value)} error={errors.phone} placeholder="3001234567" inputMode="tel" />
        <Input label="Dirección *" value={form.address} onChange={e => set('address', e.target.value)} error={errors.address} placeholder="Calle 123 # 45-67" />

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Notas del cliente
          </label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            rows={3}
            placeholder="Información adicional..."
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Map */}
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            Ubicación (toca el mapa para marcar)
          </label>
          <div className="rounded-xl overflow-hidden border border-gray-200 h-56">
            <MapContainer
              center={[lat ?? 4.711, lng ?? -74.0721]}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <MapPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln) }} />
            </MapContainer>
          </div>
          {lat && lng && (
            <p className="text-xs text-gray-400 mt-1">📍 {lat.toFixed(5)}, {lng.toFixed(5)}</p>
          )}
        </div>

        {mutation.error && (
          <p className="text-red-600 text-sm text-center">
            {(mutation.error as Error).message !== 'Validation failed'
              ? 'Error al guardar. Intenta de nuevo.'
              : ''}
          </p>
        )}

        <Button type="submit" fullWidth isLoading={mutation.isPending}>
          {isEdit ? 'Guardar Cambios' : 'Guardar Cliente'}
        </Button>
      </form>
    </div>
  )
}

