import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import SideNav from './SideNav'
import OfflineBanner from './OfflineBanner'

export default function AppShell() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <OfflineBanner />

      <div className="flex flex-1">
        {/* Sidebar — only visible on md+ */}
        <aside className="hidden md:flex md:flex-col md:w-56 lg:w-64 md:fixed md:inset-y-0 md:top-0 md:left-0 md:bg-white md:border-r md:border-gray-200 md:z-40 md:pt-4">
          <SideNav />
        </aside>

        {/* Main content */}
        <main className="flex-1 pb-20 md:pb-6 md:ml-56 lg:ml-64 min-h-screen">
          <div className="max-w-5xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom nav — only visible on mobile */}
      <div className="md:hidden bottom-nav-container">
        <BottomNav />
      </div>
    </div>
  )
}

