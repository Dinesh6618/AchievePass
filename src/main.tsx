import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/ui'
import { AuthProvider } from './contexts/AuthContext'
import { isSupabaseConfigured } from './lib/env'
import SetupRequiredPage from './pages/public/SetupRequiredPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {isSupabaseConfigured ? (
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      ) : (
        <SetupRequiredPage />
      )}
    </ErrorBoundary>
  </StrictMode>,
)
