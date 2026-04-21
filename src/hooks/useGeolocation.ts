import { useEffect, useState } from 'react'

// Manizales coordinates as fallback
const MANIZALES_LAT = 5.0692
const MANIZALES_LNG = -75.5159

interface GeolocationState {
  lat: number
  lng: number
  loading: boolean
  error: string | null
}

/**
 * Hook to get current user location using Geolocation API.
 * Falls back to Manizales coordinates if geolocation fails or is denied.
 * Only runs on initial mount.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    lat: MANIZALES_LAT,
    lng: MANIZALES_LNG,
    loading: true,
    error: null,
  })

  useEffect(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Geolocation not supported',
      }))
      return
    }

    const timeoutId = setTimeout(() => {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'Geolocation timeout',
      }))
    }, 10000) // 10 second timeout

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeoutId)
        setState({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          loading: false,
          error: null,
        })
      },
      (error) => {
        clearTimeout(timeoutId)
        console.warn('Geolocation error:', error.message)
        setState(prev => ({
          ...prev,
          loading: false,
          error: error.message,
        }))
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 0,
      }
    )

    return () => clearTimeout(timeoutId)
  }, [])

  return state
}

