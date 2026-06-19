import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import AppShell from './components/layout/AppShell'
import LoginPage from './pages/LoginPage'
import PlanningDataPage from './pages/PlanningDataPage'
import ExecutiveSummaryPage from './pages/ExecutiveSummaryPage'
import CapacityDashboardPage from './pages/ExecutiveSummaryV2Page'
import PlantDetailPage from './pages/PlantDetailPage'
import BatchExportsPage from './pages/BatchExportsPage'
import ScenariosPage from './pages/ScenariosPage'
import SettingsPage from './pages/SettingsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<PlanningDataPage />} />
        <Route path="executive-summary" element={<ExecutiveSummaryPage />} />
        <Route path="capacity-dashboard" element={<CapacityDashboardPage />} />
        {/* Old V2 path → the comprehensive view is now the Capacity Dashboard */}
        <Route path="executive-summary-v2" element={<Navigate to="/capacity-dashboard" replace />} />
        <Route path="plant-detail" element={<PlantDetailPage />} />
        <Route path="scenarios" element={<ScenariosPage />} />
        <Route path="exports" element={<BatchExportsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  )
}
