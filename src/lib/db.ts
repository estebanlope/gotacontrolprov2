import Dexie, { type EntityTable } from 'dexie'
import type {
  Client,
  Loan,
  LoanScheduleEntry,
  Payment,
  Expense,
  SyncQueueItem
} from '@/types'

// Local versions include synced flag
export interface LocalClient extends Client {
  synced: boolean
}

export interface LocalLoan extends Loan {
  synced: boolean
}

export interface LocalLoanScheduleEntry extends LoanScheduleEntry {
  synced: boolean
}

export interface LocalPayment extends Payment {
  synced: boolean
}

export interface LocalExpense extends Expense {
  synced: boolean
}

class PersonalProjectDB extends Dexie {
  clients!: EntityTable<LocalClient, 'id'>
  loans!: EntityTable<LocalLoan, 'id'>
  loan_schedule!: EntityTable<LocalLoanScheduleEntry, 'id'>
  payments!: EntityTable<LocalPayment, 'id'>
  expenses!: EntityTable<LocalExpense, 'id'>
  sync_queue!: EntityTable<SyncQueueItem, 'id'>

  constructor() {
    super('PersonalProjectDB')
    this.version(1).stores({
      clients: 'id, team_id, created_by, cedula, synced',
      loans: 'id, team_id, client_id, created_by, status, synced',
      loan_schedule: 'id, loan_id, due_date, status, synced',
      payments: 'id, loan_id, team_id, created_by, synced',
      expenses: 'id, team_id, created_by, synced',
      sync_queue: '++id, table_name, record_id, action, created_at'
    })
    this.version(2).stores({
      // Add affects_balance index to sync_queue for filtering pending balance ops
      sync_queue: '++id, table_name, record_id, action, created_at, affects_balance'
    })
  }
}

export const db = new PersonalProjectDB()

