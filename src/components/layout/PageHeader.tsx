import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'

interface PageHeaderProps {
  title: string
  showBack?: boolean
  showLogout?: boolean
  rightElement?: React.ReactNode
}

export default function PageHeader({ title, showBack = false, showLogout = false, rightElement }: PageHeaderProps) {
  const navigate = useNavigate()
  const { logout, user } = useAuth()

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 -ml-1.5 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
        )}

        <h1 className="flex-1 font-semibold text-gray-900 text-lg truncate">{title}</h1>

        {rightElement}

        {/* Logout only visible on mobile (desktop uses SideNav) */}
        {showLogout && (
          <div className="flex items-center gap-2 md:hidden">
            <span className="text-xs text-gray-500">{user?.username}</span>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut size={18} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

