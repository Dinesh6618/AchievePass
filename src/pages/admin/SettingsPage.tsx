import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Plus, Save, UserRound } from 'lucide-react'
import {
  Alert,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  SectionCard,
  SkeletonRows,
  TableWrap,
  Td,
  TextAreaField,
  TextField,
  Th,
  Tabs,
  useToast,
} from '@/components/ui'
import { useProfile } from '@/contexts/AuthContext'
import { useAsync } from '@/hooks/useAsync'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { invalidateReferenceData } from '@/hooks/useReference'
import { reportError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { getSystemSettings, saveSystemSettings, type SystemSettings } from '@/services/adminService'
import { listCategories, listDepartments, saveCategory, saveDepartment } from '@/services/referenceService'
import type { Department, EventCategory } from '@/types'

type Tab = 'departments' | 'categories' | 'system'

const activeStamp = (active: boolean) => (
  <span className={cn('stamp', active ? 'border-verified-600/40 bg-verified-50 text-verified-700' : 'border-paper-300 bg-paper-100 text-ink-500')}>
    {active ? 'Active' : 'Hidden'}
  </span>
)

export default function SettingsPage() {
  useDocumentTitle('Settings')
  const [tab, setTab] = useState<Tab>('departments')

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Settings"
        subtitle="Departments, event categories and system-wide rules."
        actions={
          <Link to="/admin/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-700 underline underline-offset-4 hover:text-ink-900">
            <UserRound className="size-4" aria-hidden /> Your profile &amp; password
          </Link>
        }
      />
      <Tabs
        label="Settings sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'departments', label: 'Departments' },
          { id: 'categories', label: 'Event categories' },
          { id: 'system', label: 'System' },
        ]}
      />
      <div className="mt-6">
        {tab === 'departments' && <DepartmentsTab />}
        {tab === 'categories' && <CategoriesTab />}
        {tab === 'system' && <SystemTab />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------- departments
function DepartmentsTab() {
  const toast = useToast()
  const list = useAsync(() => listDepartments(true), [], { context: 'departments admin' })
  const [editing, setEditing] = useState<Department | 'new' | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')} icon={<Plus className="size-4" aria-hidden />}>
          Add department
        </Button>
      </div>
      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <SkeletonRows rows={5} />
      ) : (list.data?.length ?? 0) === 0 ? (
        <EmptyState title="No departments yet" description="Students and faculty are assigned to a department." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Name</Th>
              <Th>Visibility</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {list.data!.map((d) => (
              <tr key={d.id}>
                <Td className="font-mono font-medium">{d.code}</Td>
                <Td>{d.name}</Td>
                <Td>{activeStamp(d.is_active)}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(d)} icon={<Pencil className="size-3.5" aria-hidden />}>
                    Edit
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <p className="text-xs text-ink-500">Hiding a department removes it from registration; existing students and faculty keep it.</p>

      {editing !== null && (
        <DepartmentModal
          key={editing === 'new' ? 'new' : editing.id}
          department={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidateReferenceData()
            list.reload()
            toast.success('Department saved.')
          }}
        />
      )}
    </div>
  )
}

function DepartmentModal({ department, onClose, onSaved }: { department: Department | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(department?.code ?? '')
  const [name, setName] = useState(department?.name ?? '')
  const [active, setActive] = useState(department?.is_active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim() || name.trim().length < 2) return setError('Enter a short code and the department name.')
    setBusy(true)
    setError(null)
    try {
      await saveDepartment({ id: department?.id, code, name, is_active: active })
      onSaved()
      onClose()
    } catch (err) {
      setError(reportError(err, 'save department'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={department ? 'Edit department' : 'Add department'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="dept-form" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="dept-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Code" required value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} hint="Short, e.g. CSE" autoCapitalize="characters" />
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <Checkbox label="Available for registration" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------- categories
function CategoriesTab() {
  const toast = useToast()
  const list = useAsync(() => listCategories(true), [], { context: 'categories admin' })
  const [editing, setEditing] = useState<EventCategory | 'new' | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing('new')} icon={<Plus className="size-4" aria-hidden />}>
          Add category
        </Button>
      </div>
      {list.error ? (
        <ErrorState message={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <SkeletonRows rows={6} />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Name</Th>
              <Th>Description</Th>
              <Th>Visibility</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {list.data!.map((c) => (
              <tr key={c.id}>
                <Td className="tabular-nums text-ink-500">{c.sort_order}</Td>
                <Td className="font-medium">{c.name}</Td>
                <Td className="text-ink-600">{c.description ?? '—'}</Td>
                <Td>{activeStamp(c.is_active)}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)} icon={<Pencil className="size-3.5" aria-hidden />}>
                    Edit
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <p className="text-xs text-ink-500">Hidden categories can’t be chosen for new achievements; existing records keep theirs.</p>

      {editing !== null && (
        <CategoryModal
          key={editing === 'new' ? 'new' : editing.id}
          category={editing === 'new' ? null : editing}
          nextOrder={(Math.max(0, ...(list.data ?? []).map((c) => c.sort_order)) || 0) + 10}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidateReferenceData()
            list.reload()
            toast.success('Category saved.')
          }}
        />
      )}
    </div>
  )
}

function CategoryModal({
  category,
  nextOrder,
  onClose,
  onSaved,
}: {
  category: EventCategory | null
  nextOrder: number
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [order, setOrder] = useState(String(category?.sort_order ?? nextOrder))
  const [active, setActive] = useState(category?.is_active ?? true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Enter a category name.')
    setBusy(true)
    setError(null)
    try {
      await saveCategory({ id: category?.id, name, description, sort_order: Number(order) || 0, is_active: active })
      onSaved()
      onClose()
    } catch (err) {
      setError(reportError(err, 'save category'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? 'Edit category' : 'Add category'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="cat-form" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="cat-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
        <TextAreaField label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
        <TextField label="Display order" type="number" value={order} onChange={(e) => setOrder(e.target.value)} hint="Lower numbers appear first." />
        <Checkbox label="Available for new achievements" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------------------- system
function SystemTab() {
  const toast = useToast()
  const profile = useProfile()
  const settings = useAsync(getSystemSettings, [], { context: 'system settings' })
  const [form, setForm] = useState<SystemSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (settings.data && !form) setForm(settings.data)
  }, [settings.data, form])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    const prefix = form.verification_prefix.trim().toUpperCase()
    if (!/^[A-Z0-9]{2,6}$/.test(prefix)) return setError('The verification prefix must be 2–6 letters or digits.')
    if (!form.institution_name.trim()) return setError('Enter the institution name.')

    setBusy(true)
    setError(null)
    try {
      const clean: SystemSettings = {
        ...form,
        institution_name: form.institution_name.trim(),
        verification_prefix: prefix,
      }
      await saveSystemSettings(clean, profile.id)
      invalidateReferenceData()
      setForm(clean)
      toast.success('Settings saved.')
    } catch (err) {
      setError(reportError(err, 'save settings'))
    } finally {
      setBusy(false)
    }
  }

  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.reload} />
  if (!form) return <SkeletonRows rows={4} />

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl">
      <SectionCard
        title="System settings"
        action={
          <Button type="submit" loading={busy} icon={<Save className="size-4" aria-hidden />}>
            Save settings
          </Button>
        }
      >
        <div className="space-y-5">
          {error && <Alert tone="error">{error}</Alert>}
          <TextField
            label="Institution name"
            required
            value={form.institution_name}
            onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
            hint="Shown as “Verified by” on public verification pages."
          />
          <TextField
            label="Verification ID prefix"
            required
            value={form.verification_prefix}
            onChange={(e) => setForm({ ...form, verification_prefix: e.target.value })}
            maxLength={6}
            hint={`Verification IDs look like ${(form.verification_prefix || 'CP').toUpperCase()}-${new Date().getFullYear()}-XXXXX. Existing IDs don’t change.`}
          />
          <Checkbox
            label={
              <>
                <span className="font-medium">Allow student self-registration</span>
                <span className="block text-xs text-ink-500">Turn off to accept only accounts you create yourself.</span>
              </>
            }
            checked={form.allow_student_registration}
            onChange={(e) => setForm({ ...form, allow_student_registration: e.target.checked })}
          />
        </div>
      </SectionCard>
    </form>
  )
}
