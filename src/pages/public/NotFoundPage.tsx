import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState, LinkButton } from '@/components/ui'
import { Logo } from '@/components/brand/Logo'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <div className="min-h-screen bg-paper px-5">
      <header className="mx-auto flex h-16 max-w-3xl items-center">
        <Link to="/" aria-label="CertiPass home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="mx-auto max-w-xl pt-16">
        <EmptyState
          icon={Compass}
          title="This page isn't in your passport"
          description="The link may be out of date, or the page may have moved."
          action={<LinkButton to="/">Back to home</LinkButton>}
        />
      </main>
    </div>
  )
}
