import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'
import type { Client } from '@/types'

export function useClients() {
  const { user } = useAuth()

  return useQuery<Client[]>({
    queryKey: ['clients', user?.team_id, user?.id, user?.role],
    queryFn: async () => {
      if (!navigator.onLine) {
        const local = await db.clients
          .where('team_id')
          .equals(user!.team_id!)
          .toArray()
        // cobrador sees only their own
        if (user?.role === 'cobrador') {
          return local.filter(c => c.created_by === user.id)
        }
        return local
      }

      let query = supabase
        .from('clients')
        .select('*')
        .eq('team_id', user!.team_id!)
        .order('created_at', { ascending: false })

      if (user?.role === 'cobrador') {
        query = query.eq('created_by', user.id)
      }

      const { data, error } = await query
      if (error) throw error

      // Cache locally
      if (data) {
        await db.clients.bulkPut(data.map(c => ({ ...c, synced: true })))
      }
      return data ?? []
    },
    enabled: !!user?.team_id,
    staleTime: 1000 * 60 * 2,
  })
}

export function useClient(id: string) {
  const { user } = useAuth()

  return useQuery<Client | null>({
    queryKey: ['client', id],
    queryFn: async () => {
      if (!navigator.onLine) {
        return (await db.clients.get(id)) ?? null
      }
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id && !!user,
  })
}

