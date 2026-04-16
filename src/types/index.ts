// ─── Roles ────────────────────────────────────────────────────────────────────
export type UserRole = 'superadmin' | 'admin' | 'cobrador'

// ─── Teams ────────────────────────────────────────────────────────────────────
export interface Team {
  id: string
  name: string
  created_at: string
  telegram_bot_active: boolean
  telegram_bot_token: string | null
  telegram_bot_name: string | null
  telegram_chat_id: string | null
}

// ─── Users ────────────────────────────────────────────────────────────────────
export interface User {
  id: string
  username: string
  pin_hash: string
  role: UserRole
  team_id: string | null
  balance: number
  created_at: string
}

export interface AuthUser {
  id: string
  username: string
  role: UserRole
  team_id: string | null
  balance: number
}

// ─── Config ───────────────────────────────────────────────────────────────────
export interface Config {
  id: string
  team_id: string
  capital_base: number
  default_interest_rate: number
}

// ─── Clients ──────────────────────────────────────────────────────────────────
export interface Client {
  id: string
  team_id: string
  created_by: string
  full_name: string
  cedula: string
  phone: string
  address: string
  lat: number | null
  lng: number | null
  notes: string | null
  photo_url: string | null
  created_at: string
}

// ─── Loans ────────────────────────────────────────────────────────────────────
export type PaymentType = 'daily' | 'weekly' | 'biweekly' | 'monthly'
export type LoanStatus = 'pending' | 'active' | 'overdue' | 'paid'

export interface Loan {
  id: string
  team_id: string
  client_id: string
  created_by: string
  capital: number
  interest_rate: number
  payment_type: PaymentType
  term_weeks: number
  disbursement_date: string // ISO date string
  due_date: string          // ISO date string
  next_payment_date: string | null
  status: LoanStatus
  created_at: string
}

// ─── Loan Schedule ────────────────────────────────────────────────────────────
export type ScheduleStatus = 'pending' | 'paid'

export interface LoanScheduleEntry {
  id: string
  loan_id: string
  due_date: string
  amount: number
  status: ScheduleStatus
}

// ─── Payments ─────────────────────────────────────────────────────────────────
export type PaymentMethod = 'cash' | 'transfer'

export interface Payment {
  id: string
  loan_id: string
  team_id: string
  created_by: string
  amount: number
  method: PaymentMethod
  payment_date: string
  created_at: string
}

// ─── Expenses ─────────────────────────────────────────────────────────────────
export type ExpenseType = 'gasolina' | 'transporte' | 'salario' | 'otros'

export interface Expense {
  id: string
  team_id: string
  created_by: string
  type: ExpenseType
  amount: number
  notes: string | null
  created_at: string
}

// ─── Offline Queue ────────────────────────────────────────────────────────────
export type SyncAction = 'insert' | 'update'
export type SyncTable = 'clients' | 'loans' | 'loan_schedule' | 'payments' | 'expenses'

export interface SyncQueueItem {
  id?: number
  table_name: SyncTable
  record_id: string
  action: SyncAction
  payload: Record<string, unknown>
  created_at: string
  retry_count: number
}

