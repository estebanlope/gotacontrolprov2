import { useState } from 'react'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { Send } from 'lucide-react'

interface Props { teamId: string; dateFrom: string; dateTo: string }

export default function SendTelegramSummary({ teamId, dateFrom, dateTo }: Props) {
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const handleSend = async () => {
    const workerUrl = (import.meta.env.VITE_CF_WORKER_URL as string)?.replace(/\/$/, '')
    if (!workerUrl) { setStatus('error'); return }

    setStatus('sending')
    try {
      const res = await fetch(`${workerUrl}/notify/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_id: teamId, date_from: dateFrom, date_to: dateTo }),
      })
      setStatus(res.ok ? 'sent' : 'error')
      if (res.ok) setTimeout(() => setStatus('idle'), 3000)
    } catch {
      setStatus('error')
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-blue-900">📤 Enviar Resumen por Telegram</p>
          <p className="text-xs text-blue-600 mt-0.5">Envía el resumen del período seleccionado al bot</p>
        </div>
        <Button
          size="sm"
          onClick={handleSend}
          isLoading={status === 'sending'}
          variant={status === 'sent' ? 'secondary' : 'primary'}
          className={status === 'sent' ? 'bg-green-600 text-white' : ''}
        >
          {status === 'sent' ? '✅ Enviado' : status === 'error' ? '❌ Error' : (
            <><Send size={14} className="mr-1" /> Enviar</>
          )}
        </Button>
      </div>
    </Card>
  )
}

