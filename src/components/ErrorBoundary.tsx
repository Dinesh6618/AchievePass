import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Last line of defence: a render crash shows a recoverable message instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[CertiPass] render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto my-16 max-w-md rounded-lg border border-rejected-600/30 bg-rejected-50 p-6 text-center">
        <AlertTriangle className="mx-auto size-8 text-rejected-600" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold text-rejected-700">Something went wrong on this page</h2>
        <p className="mt-1 text-sm text-rejected-700/80">
          Your work elsewhere is safe. Try again, and if it keeps happening let your administrator know.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button onClick={() => window.location.assign('/')}>Go home</Button>
        </div>
      </div>
    )
  }
}
