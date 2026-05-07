import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

const PIN_LENGTH = 6

export default function LoginPage() {
  const { login, isLoading } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handlePinKey = (key: string) => {
    if (key === 'del') {
      setPin(prev => prev.slice(0, -1))
      return
    }

    setPin(prev => (prev.length < PIN_LENGTH ? prev + key : prev))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!username.trim()) {
      setError('Ingresa tu usuario')
      return
    }
    if (pin.length < PIN_LENGTH) {
      setError('El PIN debe tener 6 dígitos')
      return
    }

    setError(null)
    const { error: loginError } = await login(username.trim(), pin)

    if (loginError) {
      setError(loginError)
      setPin('')
      return
    }

    // Redirect based on role (AuthProvider stores user, navigate to / to let router decide)
    navigate('/', { replace: true })
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className="text-4xl mb-3">💰</div>
            <h1 className="text-2xl font-bold text-gray-900">PersonalProject</h1>
            <p className="text-gray-500 text-sm mt-1">Control de Préstamos</p>
          </div>

          {/* Username */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="username">
              Usuario
            </label>
            <input
              id="username"
              name="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Ingresa tu usuario"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* PIN dots */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-3 text-center" htmlFor="password">
              PIN (6 dígitos)
            </label>
            <div className="flex justify-center gap-3">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    'w-4 h-4 rounded-full border-2 transition-all duration-150',
                    i < pin.length ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  )}
                />
              ))}
            </div>
            <input
              id="password"
              name="password"
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH))}
              autoComplete="current-password"
              inputMode="numeric"
              maxLength={PIN_LENGTH}
              pattern="[0-9]*"
              className="w-full mt-3 border border-dashed border-gray-200 rounded-lg px-4 py-1.5 text-center text-xs tracking-[0.35em] text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:text-gray-700"
              aria-label="PIN"
            />
            <p className="mt-1 text-[11px] text-center text-gray-400">
              Compatible con autocompletar y guardado de contrasenas
            </p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-600 text-sm text-center mb-4 font-medium">
              {error}
            </p>
          )}

          {/* PIN Keypad */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {keys.map((key, idx) => {
              if (key === '') return <div key={idx} />
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => (key === 'del' ? handlePinKey('del') : handlePinKey(key))}
                  disabled={isLoading}
                  className={cn(
                    'h-14 rounded-xl font-semibold text-lg transition-all active:scale-95',
                    key === 'del'
                      ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      : 'bg-gray-50 text-gray-900 hover:bg-gray-100 shadow-sm'
                  )}
                >
                  {key === 'del' ? '⌫' : key}
                </button>
              )
            })}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || pin.length < PIN_LENGTH || !username.trim()}
            className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold text-base
                     hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all active:scale-95"
          >
            {isLoading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
