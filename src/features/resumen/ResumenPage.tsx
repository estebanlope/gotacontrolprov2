import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import PageHeader from '@/components/layout/PageHeader'
import { todayISO, startOfWeekISO, startOfMonthISO } from '@/lib/utils'
import CapitalPosition from './CapitalPosition'
import PortfolioStatus from './PortfolioStatus'
import WeeklyCashFlow from './WeeklyCashFlow'
import CollectionProgress from './CollectionProgress'
import CollectionBreakdown from './CollectionBreakdown'
import LoansSummary from './LoansSummary'
import ClientsSummary from './ClientsSummary'
import SendTelegramSummary from './SendTelegramSummary'
import { Users } from 'lucide-react'

type Preset = 'today' | 'week' | 'month' | 'custom'

export default function ResumenPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const today = todayISO()

  const [preset, setPreset] = useState<Preset>('today')
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)

  const handlePreset = (p: Preset) => {
    setPreset(p)
    if (p === 'today') { setDateFrom(today); setDateTo(today) }
    else if (p === 'week') { setDateFrom(startOfWeekISO()); setDateTo(today) }
    else if (p === 'month') { setDateFrom(startOfMonthISO()); setDateTo(today) }
  }

  const isAdmin = user?.role === 'admin'
  const teamId = user?.team_id!
  const userId = user?.id!

  const presets: { key: Preset; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mes' },
    { key: 'custom', label: 'Personalizado' },
  ]

  return (
    <div>
      <PageHeader
        title="Inicio"
        showLogout
        rightElement={
          isAdmin ? (
            <button
              onClick={() => navigate('/usuarios')}
              className="p-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              title="Gestionar usuarios"
            >
              <Users size={20} />
            </button>
          ) : undefined
        }
      />

      <div className="p-4 space-y-4">
        {/* Date filter */}
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {presets.map(p => (
              <button
                key={p.key}
                onClick={() => handlePreset(p.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  preset === p.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {preset === 'custom' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Desde</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Hasta</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Shared widgets — responsive grid on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CollectionProgress teamId={teamId} userId={userId} isAdmin={isAdmin} dateFrom={dateFrom} dateTo={dateTo} />
          <CollectionBreakdown teamId={teamId} userId={userId} isAdmin={isAdmin} dateFrom={dateFrom} dateTo={dateTo} preset={preset} />
          <LoansSummary teamId={teamId} userId={userId} isAdmin={isAdmin} dateFrom={dateFrom} dateTo={dateTo} />
          <ClientsSummary teamId={teamId} isAdmin={isAdmin} />
        </div>

        {/* Admin only widgets */}
        {isAdmin && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CapitalPosition teamId={teamId} dateFrom={dateFrom} dateTo={dateTo} />
            <PortfolioStatus teamId={teamId} />
            <WeeklyCashFlow teamId={teamId} />
            <SendTelegramSummary teamId={teamId} dateFrom={dateFrom} dateTo={dateTo} />
          </div>
        )}
      </div>
    </div>
  )
}

