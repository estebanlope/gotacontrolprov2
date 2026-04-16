import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import AppShell from '@/components/layout/AppShell'

// Auth
import LoginPage from '@/features/auth/LoginPage'

// Clients
import ClientsListPage from '@/features/clients/ClientsListPage'
import ClientDetailPage from '@/features/clients/ClientDetailPage'
import ClientForm from '@/features/clients/ClientForm'

// Loans
import LoansListPage from '@/features/loans/LoansListPage'
import LoanDetailPage from '@/features/loans/LoanDetailPage'
import LoanForm from '@/features/loans/LoanForm'
import LoanEditPage from '@/features/loans/LoanEditPage'

// Payments
import PaymentsListPage from '@/features/payments/PaymentsListPage'
import PaymentForm from '@/features/payments/PaymentForm'

// Expenses
import ExpensesListPage from '@/features/expenses/ExpensesListPage'
import ExpenseForm from '@/features/expenses/ExpenseForm'

// Resumen
import ResumenPage from '@/features/resumen/ResumenPage'

// Users
import UsersPage from '@/features/users/UsersPage'

// SuperAdmin
import TeamsPage from '@/features/superadmin/TeamsPage'
import SuperAdminUsersPage from '@/features/superadmin/UsersPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function RootRedirect() {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'superadmin') return <Navigate to="/superadmin/equipos" replace />
  return <Navigate to="/inicio" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />

            {/* Root redirect */}
            <Route path="/" element={<RootRedirect />} />

            {/* SuperAdmin routes */}
            <Route
              path="/superadmin"
              element={
                <ProtectedRoute allowedRoles={['superadmin']}>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="equipos" element={<TeamsPage />} />
              <Route path="usuarios" element={<SuperAdminUsersPage />} />
              <Route index element={<Navigate to="equipos" replace />} />
            </Route>

            {/* Admin + Cobrador routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute allowedRoles={['admin', 'cobrador']}>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="inicio" element={<ResumenPage />} />

              <Route path="clientes" element={<ClientsListPage />} />              <Route path="clientes/nuevo" element={<ClientForm />} />
              <Route path="clientes/:id" element={<ClientDetailPage />} />

              <Route path="prestamos" element={<LoansListPage />} />
              <Route path="prestamos/nuevo" element={<LoanForm />} />
              <Route path="prestamos/:id" element={<LoanDetailPage />} />
              <Route
                path="prestamos/:id/editar"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <LoanEditPage />
                  </ProtectedRoute>
                }
              />

              <Route path="pagos" element={<PaymentsListPage />} />
              <Route path="pagos/nuevo" element={<PaymentForm />} />

              <Route path="gastos" element={<ExpensesListPage />} />
              <Route path="gastos/nuevo" element={<ExpenseForm />} />


              <Route
                path="usuarios"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

