import { Logo } from '@/components/brand/Logo'

/** Shown instead of the app when the Supabase environment variables are missing. */
export default function SetupRequiredPage() {
  return (
    <div className="min-h-screen bg-paper px-5 py-10">
      <div className="mx-auto max-w-2xl">
        <Logo />
        <div className="card mt-8 p-6 sm:p-8">
          <h1 className="text-2xl font-semibold">Connect CertiPass to Supabase</h1>
          <p className="mt-2 text-sm text-ink-600">
            The app can't find your Supabase project. Create a <code className="rounded bg-paper-100 px-1">.env.local</code>{' '}
            file in the project root:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md bg-ink-900 p-4 text-xs leading-relaxed text-ink-100">
{`VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key`}
          </pre>
          <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-ink-600">
            <li>Run the SQL files in <code className="rounded bg-paper-100 px-1">supabase/migrations</code> (in order) on your project.</li>
            <li>Copy the project URL and the <strong>anon</strong> key from Project Settings → API.</li>
            <li>Restart <code className="rounded bg-paper-100 px-1">npm run dev</code>.</li>
          </ol>
          <p className="mt-5 text-xs text-ink-500">
            Never put the service-role key in a <code>VITE_</code> variable — it would be shipped to every visitor's browser.
          </p>
        </div>
      </div>
    </div>
  )
}
