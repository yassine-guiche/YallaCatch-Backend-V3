import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './components/ui/theme-toggle'
import './index.css'
import './i18n' // Initialize i18n
import App from './App.jsx'

// Suppress all console output in production to prevent data exposure
if (import.meta.env.PROD) {
  const noop = () => { };
  console.log = noop;
  console.warn = noop;
  console.info = noop;
  console.debug = noop;
  // Keep console.error for critical error tracking
}

// Create a client with optimized defaults for caching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // Data stays fresh for 5 minutes
      gcTime: 10 * 60 * 1000, // Cache garbage collection after 10 minutes
      refetchOnWindowFocus: false, // Don't refetch on window focus
      retry: 1, // Only retry once on failure
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="yallacatch-theme">
        <App />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
