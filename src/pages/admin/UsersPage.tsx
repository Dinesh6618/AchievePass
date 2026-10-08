import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Copy, GraduationCap, KeyRound, Pencil, Plus, SearchX, UserCheck, UserX, Users } from 'lucide-react'
import {
  Alert,
  Avatar,
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FilterInput,
  FilterSelect,
  Modal,
  PageHeader,
  Pagination,
  SelectField,
  SkeletonRows,
  TableWrap,
  Td,
  TextField,
  Th,
  useToast,
} from '@/components/ui'
import { useAsync } from '@/hooks/useAsync'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useDepartments } from '@/hooks/useReference'
import { AppError, reportError } from '@/lib/errors'
import { cn, generatePassword } from '@/lib/utils'
import { normalizeUsername, validateUsername } from '@/lib/identity'
import { validatePassword } from '@/services/authService'
import {
  adminCreateAccount,
  adminUpdateProfile,
  listFaculty,
  listStudents,
  type AdminProfilePatch,
} from '@/services/profileService'

type Kind = 'student' | 'faculty'

interface Row {
  id: string
  fullName: string
  /** the sign-in name: a username for students, the e-mail address for faculty */
  login: string
  identifier: string | null
  departmentId: string | null
  departmentName: string | null
  year: number | null
  section: string | null
  designation: string | null
  phone: string | null
  avatar: string | null
  active: boolean
}

const PAGE_SIZE = 20

interface FormState {
  fullName: string
  /** username (students) or e-mail address (faculty) */
  login: string
  password: string
  departmentId: string
  identifier: string
  year: string
  section: string
  designation: string
  phone: string
}

const EMPTY: FormState = {
  fullName: '', login: '', password: '', departmentId: '', identifier: '', year: '', section: '', designation: '', phone: '',
}

export default function UsersPage({ kind }: { kind: Kind }) {
  const isStudent = kind === 'student'
  const noun = isStudent ? 'student' : 'faculty member'
  useDocumentTitle(isStudent ? 'Students' : 'Faculty')
  const toast = useToast()
  const departments = useDepartments()

  const [q, setQ] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [page, setPage] = useState(0)
  const search = useDebouncedValue(q, 300)

  const result = useAsync(
    async () => {
      if (isStudent) {
        const res = await listStudents({ search, departmentId: departmentId || undefined, page, pageSize: PAGE_SIZE })
        return {
          total: res.total,
          rows: res.rows.map<Row>((s) => ({
            id: s.id, fullName: s.full_name, login: s.username, identifier: s.register_number,
            departmentId: s.department_id, departmentName: s.department_name, year: s.year, section: s.section,
            designation: null, phone: s.phone, avatar: s.avatar_url, active: s.is_active,
          })),
        }
      }
      const list = await listFaculty({ search, departmentId: departmentId || undefined })
      return {
        total: list.length,
        rows: list.map<Row>((p) => ({
          id: p.id, fullName: p.full_name, login: p.email ?? '', identifier: p.faculty_id,
          departmentId: p.department_id, departmentName: p.department?.name ?? null, year: null, section: null,
          designation: p.designation, phone: p.phone, avatar: p.avatar_url, active: p.is_active,
        })),
      }
    },
    [kind, search, departmentId, page],
    { context: `${kind} directory` },
  )

  const [editing, setEditing] = useState<Row | null>(null)
  const [adding, setAdding] = useState(false)
  const [toggling, setToggling] = useState<Row | null>(null)
  const [toggleBusy, setToggleBusy] = useState(false)

  const rows = result.data?.rows ?? []

  const confirmToggle = async () => {
    if (!toggling) return
    setToggleBusy(true)
    try {
      await adminUpdateProfile(toggling.id, { is_active: !toggling.active })
      toast.success(`${toggling.fullName} ${toggling.active ? 'deactivated' : 'reactivated'}.`)
      setToggling(null)
      result.reload()
    } catch (err) {
      toast.error(reportError(err, 'toggle account'))
    } finally {
      setToggleBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title={isStudent ? 'Students' : 'Faculty'}
        subtitle={result.data ? `${result.data.total} ${result.data.total === 1 ? noun : isStudent ? 'students' : 'faculty'}` : undefined}
        actions={
          <Button onClick={() => setAdding(true)} icon={<Plus className="size-4" aria-hidden />}>
            Add {noun}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="search" aria-label={`Find ${noun}`}>
        <FilterInput
          type="search"
          aria-label={`Search ${isStudent ? 'students' : 'faculty'}`}
          placeholder={isStudent ? 'Name, register number or username…' : 'Name, faculty ID or email…'}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(0)
          }}
          className="w-full sm:w-80"
        />
        <FilterSelect
          aria-label="Department"
          value={departmentId}
          onChange={(e) => {
            setDepartmentId(e.target.value)
            setPage(0)
          }}
        >
          <option value="">All departments</option>
          {departments.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </FilterSelect>
      </div>

      {result.error ? (
        <ErrorState message={result.error} onRetry={result.reload} />
      ) : result.loading && !result.data ? (
        <SkeletonRows rows={8} />
      ) : rows.length === 0 ? (
        search || departmentId ? (
          <EmptyState icon={SearchX} title="No matches" description="Try a different search or department." />
        ) : (
          <EmptyState
            icon={isStudent ? GraduationCap : Users}
            title={isStudent ? 'No students yet' : 'No faculty accounts yet'}
            description={isStudent ? 'Students appear here when they register, or you can add them.' : 'Faculty sign-in accounts are created by administrators.'}
            action={
              <Button onClick={() => setAdding(true)} icon={<Plus className="size-4" aria-hidden />}>
                Add {noun}
              </Button>
            }
          />
        )
      ) : (
        <>
          <TableWrap>
            <thead>
              <tr>
                <Th>{isStudent ? 'Student' : 'Faculty member'}</Th>
                <Th>Department</Th>
                <Th>{isStudent ? 'Year / Section' : 'Designation'}</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn('hover:bg-paper/60', !r.active && 'opacity-70')}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.fullName} src={r.avatar} size="sm" />
                      <div className="min-w-0">
                        {isStudent ? (
                          <Link to={`/admin/students/${r.id}`} className="block font-medium underline-offset-2 hover:underline">
                            {r.fullName}
                          </Link>
                        ) : (
                          <span className="block font-medium">{r.fullName}</span>
                        )}
                        <span className="block truncate text-xs text-ink-500">
                          <span className="font-mono">{r.identifier}</span> · {isStudent ? `@${r.login}` : r.login}
                        </span>
                      </div>
                    </div>
                  </Td>
                  <Td>{r.departmentName ?? '—'}</Td>
                  <Td>{isStudent ? `${r.year ? `Year ${r.year}` : '—'}${r.section ? ` · ${r.section}` : ''}` : (r.designation ?? '—')}</Td>
                  <Td>
                    <span className={cn('stamp', r.active ? 'border-verified-600/40 bg-verified-50 text-verified-700' : 'border-paper-300 bg-paper-100 text-ink-500')}>
                      {r.active ? 'Active' : 'Inactive'}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.fullName}`} icon={<Pencil className="size-3.5" aria-hidden />}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setToggling(r)}
                        aria-label={`${r.active ? 'Deactivate' : 'Reactivate'} ${r.fullName}`}
                        icon={r.active ? <UserX className="size-3.5" aria-hidden /> : <UserCheck className="size-3.5" aria-hidden />}
                      >
                        {r.active ? 'Deactivate' : 'Reactivate'}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          {isStudent && <Pagination page={page} pageSize={PAGE_SIZE} total={result.data?.total ?? 0} onChange={setPage} />}
        </>
      )}

      <AccountModal
        key={editing?.id ?? (adding ? 'new' : 'closed')}
        kind={kind}
        open={adding || editing !== null}
        row={editing}
        onClose={() => {
          setAdding(false)
          setEditing(null)
        }}
        onSaved={() => result.reload()}
      />

      <ConfirmDialog
        open={toggling !== null}
        onClose={() => setToggling(null)}
        onConfirm={confirmToggle}
        loading={toggleBusy}
        danger={toggling?.active}
        title={toggling?.active ? `Deactivate ${toggling.fullName}?` : `Reactivate ${toggling?.fullName}?`}
        confirmLabel={toggling?.active ? 'Deactivate' : 'Reactivate'}
        message={
          toggling?.active
            ? 'They will be signed out and unable to use CertiPass until reactivated. Their records are kept.'
            : 'They will be able to sign in again.'
        }
      />
    </div>
  )
}

function AccountModal({
  kind,
  open,
  row,
  onClose,
  onSaved,
}: {
  kind: Kind
  open: boolean
  row: Row | null
  onClose: () => void
  onSaved: () => void
}) {
  const isStudent = kind === 'student'
  const editing = row !== null
  const toast = useToast()
  const departments = useDepartments()
  const [form, setForm] = useState<FormState>(() =>
    row
      ? {
          fullName: row.fullName, login: row.login, password: '', departmentId: row.departmentId ?? '',
          identifier: row.identifier ?? '', year: row.year ? String(row.year) : '', section: row.section ?? '',
          designation: row.designation ?? '', phone: row.phone ?? '',
        }
      : EMPTY,
  )
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ login: string; password: string } | null>(null)

  const set = <K extends keyof FormState>(key: K) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((cur) => ({ ...cur, [key]: undefined }))
  }

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (form.fullName.trim().length < 2) e.fullName = 'Enter the full name.'
    if (!form.departmentId) e.departmentId = 'Choose a department.'
    if (!form.identifier.trim()) e.identifier = isStudent ? 'Enter the register number.' : 'Enter the faculty ID.'
    if (isStudent && !form.year) e.year = 'Choose the year.'
    if (isStudent && !form.section.trim()) e.section = 'Enter the section.'
    if (form.phone.trim() && !/^[0-9+()\- ]{7,20}$/.test(form.phone.trim())) e.phone = 'Enter a valid phone number.'
    if (!editing) {
      if (isStudent) {
        const u = validateUsername(form.login)
        if (u) e.login = u
      } else if (!/^\S+@\S+\.\S+$/.test(form.login.trim())) {
        e.login = 'Enter a valid email address.'
      }
      const pw = validatePassword(form.password)
      if (pw) e.password = pw
    }
    return e
  }

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault()
    setFormError(null)
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setBusy(true)
    try {
      if (editing && row) {
        const patch: AdminProfilePatch = {
          full_name: form.fullName.trim(),
          department_id: form.departmentId,
          phone: form.phone.trim() || null,
          ...(isStudent
            ? { register_number: form.identifier.trim(), year: Number(form.year), section: form.section.trim() }
            : { faculty_id: form.identifier.trim(), designation: form.designation.trim() || null }),
        }
        await adminUpdateProfile(row.id, patch)
        toast.success('Account updated.')
        onSaved()
        onClose()
      } else {
        await adminCreateAccount({
          role: kind,
          ...(isStudent ? { username: normalizeUsername(form.login) } : { email: form.login.trim() }),
          password: form.password,
          fullName: form.fullName.trim(),
          departmentId: form.departmentId,
          ...(isStudent
            ? { registerNumber: form.identifier.trim(), year: Number(form.year), section: form.section.trim() }
            : { facultyId: form.identifier.trim(), designation: form.designation.trim() }),
        })
        onSaved()
        setCreated({ login: isStudent ? normalizeUsername(form.login) : form.login.trim(), password: form.password })
      }
    } catch (err) {
      setFormError(err instanceof AppError ? err.message : reportError(err, 'save account', "We couldn't save this account."))
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${what} copied.`)
    } catch {
      toast.error('Copy failed — select the text and copy it manually.')
    }
  }

  const title = created ? 'Account created' : editing ? `Edit ${row.fullName}` : isStudent ? 'Add student' : 'Add faculty member'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        created ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="account-form" loading={busy}>
              {editing ? 'Save changes' : 'Create account'}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <Alert tone="success" title="The account is ready">
            Share these sign-in details securely. The password is shown only now — ask them to change it from their profile after signing in.
          </Alert>
          <dl className="space-y-3 rounded-md border border-paper-200 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <dt className="text-xs uppercase tracking-wider text-ink-500">{isStudent ? 'Username' : 'Email'}</dt>
                <dd className="font-medium">{created.login}</dd>
              </div>
              <Button size="sm" variant="secondary" onClick={() => copy(created.login, isStudent ? 'Username' : 'Email')} icon={<Copy className="size-3.5" aria-hidden />}>
                Copy
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <dt className="text-xs uppercase tracking-wider text-ink-500">Temporary password</dt>
                <dd className="font-mono font-medium">{created.password}</dd>
              </div>
              <Button size="sm" variant="secondary" onClick={() => copy(created.password, 'Password')} icon={<Copy className="size-3.5" aria-hidden />}>
                Copy
              </Button>
            </div>
          </dl>
        </div>
      ) : (
        <form id="account-form" onSubmit={onSubmit} noValidate className="space-y-5">
          {formError && <Alert tone="error">{formError}</Alert>}
          <TextField label="Full name" required value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label={isStudent ? 'Register number' : 'Faculty ID'}
              required
              value={form.identifier}
              onChange={set('identifier')}
              error={errors.identifier}
              autoCapitalize="characters"
            />
            <SelectField label="Department" required value={form.departmentId} onChange={set('departmentId')} error={errors.departmentId}>
              <option value="">Select…</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
          </div>

          {isStudent ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField label="Year" required value={form.year} onChange={set('year')} error={errors.year}>
                <option value="">Select…</option>
                {[1, 2, 3, 4].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </SelectField>
              <TextField label="Section" required value={form.section} onChange={set('section')} error={errors.section} maxLength={10} />
            </div>
          ) : (
            <TextField label="Designation" value={form.designation} onChange={set('designation')} placeholder="e.g. Assistant Professor" maxLength={80} />
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            {isStudent ? (
              <TextField
                label="Username"
                required={!editing}
                readOnly={editing}
                autoCapitalize="none"
                spellCheck={false}
                value={form.login}
                onChange={set('login')}
                error={errors.login}
                hint={editing ? 'The username is the sign-in name and can’t be changed.' : '3–100 letters, numbers, dots, dashes or underscores; one @ is allowed.'}
              />
            ) : (
              <TextField
                label="College email"
                type="email"
                required={!editing}
                readOnly={editing}
                value={form.login}
                onChange={set('login')}
                error={errors.login}
                hint={editing ? 'Email can’t be changed here.' : undefined}
              />
            )}
            <TextField label="Phone" type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />
          </div>

          {!editing && (
            <div className="space-y-1.5">
              <TextField
                label="Temporary password"
                required
                value={form.password}
                onChange={set('password')}
                error={errors.password}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                hint="8+ characters with a letter and a number. The user can change it after signing in."
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setForm((f) => ({ ...f, password: generatePassword() }))
                  setErrors((cur) => ({ ...cur, password: undefined }))
                }}
                icon={<KeyRound className="size-3.5" aria-hidden />}
              >
                Generate password
              </Button>
            </div>
          )}
        </form>
      )}
    </Modal>
  )
}
