import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import {
  BarChart3,
  Users,
  DollarSign,
  CreditCard,
  TrendingDown,
  Shield,
  LogOut,
  UserCog
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

export default function SideNav() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const navItems = user?.role === 'superadmin' ? superadminNav : adminNav
  const isAdmin = user?.role === 'admin'

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">PersonalProject</p>
            <p className="text-xs text-gray-400">Control de Préstamos</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-1">
        {/* Manage users — admin only */}
        {isAdmin && (
          <button
            onClick={() => navigate('/usuarios')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all"
          >
            <UserCog size={18} strokeWidth={1.8} />
            Usuarios
          </button>
        )}

        {/* User info + logout */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.username}</p>
            <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors flex-shrink-0"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

