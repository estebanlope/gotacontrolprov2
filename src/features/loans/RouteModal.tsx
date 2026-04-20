import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, RotateCcw } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { LoanWithClient } from './useLoans'

// ─── Storage helpers ──────────────────────────────────────────────────────────
export function getRouteOrder(userId: string): string[] {
  try {
    const raw = localStorage.getItem(`route_order_${userId}`)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

export function saveRouteOrder(userId: string, ids: string[]): void {
  localStorage.setItem(`route_order_${userId}`, JSON.stringify(ids))
}

// ─── Sortable item ────────────────────────────────────────────────────────────
function SortableItem({ loan }: { loan: LoanWithClient }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: loan.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-3 shadow-sm"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-300 hover:text-gray-500 touch-none cursor-grab active:cursor-grabbing flex-shrink-0"
        aria-label="Arrastrar"
      >
        <GripVertical size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm truncate">
          {loan.client_name ?? '—'}
        </p>
        <p className="text-xs text-gray-500">{formatCurrency(loan.capital)}</p>
      </div>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
          loan.status === 'overdue'
            ? 'bg-orange-100 text-orange-700'
            : 'bg-blue-100 text-blue-700'
        }`}
      >
        {loan.status === 'overdue' ? 'En mora' : 'Activo'}
      </span>
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface Props {
  userId: string
  loans: LoanWithClient[]
  onClose: () => void
}

export default function RouteModal({ userId, loans, onClose }: Props) {
  const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'overdue')

  const [items, setItems] = useState<LoanWithClient[]>([])

  // B: hide BottomNav while modal is open
  useEffect(() => {
    document.body.classList.add('route-modal-open')
    return () => document.body.classList.remove('route-modal-open')
  }, [])

  useEffect(() => {
    const savedOrder = getRouteOrder(userId)
    if (savedOrder.length > 0) {
      const ordered: LoanWithClient[] = []
      // First: loans that are in saved order
      savedOrder.forEach(id => {
        const found = activeLoans.find(l => l.id === id)
        if (found) ordered.push(found)
      })
      // Then: new loans not yet in the saved order
      activeLoans.forEach(l => {
        if (!savedOrder.includes(l.id)) ordered.push(l)
      })
      setItems(ordered)
    } else {
      setItems(activeLoans)
    }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems(prev => {
      const oldIndex = prev.findIndex(l => l.id === active.id)
      const newIndex = prev.findIndex(l => l.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function handleSave() {
    saveRouteOrder(userId, items.map(l => l.id))
    onClose()
  }

  function handleReset() {
    localStorage.removeItem(`route_order_${userId}`)
    setItems(activeLoans)
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm">
        <div>
          <p className="font-bold text-gray-900">📍 Ruta de cobro</p>
          <p className="text-xs text-gray-500">Arrastra para ordenar los clientes</p>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
          <X size={20} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {items.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium">Sin préstamos activos</p>
          </div>
        )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map(l => l.id)} strategy={verticalListSortingStrategy}>
            {items.map(loan => (
              <SortableItem key={loan.id} loan={loan} />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {/* Footer */}
      <div className="p-4 bg-white border-t border-gray-100 flex gap-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
        >
          <RotateCcw size={15} />
          Restablecer
        </button>
        <button
          onClick={handleSave}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all"
        >
          Guardar orden
        </button>
      </div>
    </div>
  )
}

