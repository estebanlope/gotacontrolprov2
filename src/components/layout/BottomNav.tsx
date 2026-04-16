import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  Users,
  DollarSign,
  CreditCard,
  TrendingDown,
  Shield
} from 'lucide-react'

const adminNav = [
  { to: '/inicio', icon: BarChart3, label: 'Inicio' },
  { to: '/clientes', icon: Users, label: 'Clientes' },
  { to: '/prestamos', icon: DollarSign, label: 'Préstamos' },
  { to: '/pagos', icon: CreditCard, label: 'Pagos' },
  { to: '/gastos', icon: TrendingDown, label: 'Gastos' },
]

const superadminNav = [
  { to: '/superadmin/equipos', icon: Shield, label: 'Equipos' },
  { to: '/superadmin/usuarios', icon: Users, label: 'Usuarios' },
]

export default function BottomNav() {
  const { user } = useAuth()

  const navItems = user?.role === 'superadmin' ? superadminNav : adminNav

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-pb">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 px-2 py-2 min-w-0 flex-1 transition-colors',
                isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                <span className="text-[10px] font-medium truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

