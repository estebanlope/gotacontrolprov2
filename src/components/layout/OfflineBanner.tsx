import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'

export default function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="bg-yellow-400 text-yellow-900 px-4 py-2 flex items-center gap-2 text-sm font-medium">
      <WifiOff size={16} />
      <span>Sin conexión — los cambios se sincronizarán automáticamente cuando vuelvas en línea</span>
    </div>
  )
}

