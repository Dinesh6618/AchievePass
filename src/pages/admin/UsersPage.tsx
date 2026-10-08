import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Copy, GraduationCap, KeyRound, Pencil, Plus, SearchX, Trash2, UserCheck, UserX, Users } from 'lucide-react'
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
  PasswordField,
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
import { cn } from '@/lib/utils'
import { normalizeUsername, USERNAME_MAX, validateUsername } from '@/lib/identity'
import { validatePassword } from '@/services/authService'
import {
  adminCreateAccount,
  adminDeleteFaculty,
  adminSetPassword,
  adminUpdateProfile,
  listFaculty,
  listStudents,
  type AdminProfilePatch,
} from '@/services/profileService'

type Kind = 'student' | 'faculty'

interface Row {
  id: string
  fullName: string
  /** the sign-in username */
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
  login: string
  password: string
  confirm: string
  departmentId: string
  identifier: string
  year: string
  section: string
  designation: string
  phone: string
}

const EMPTY: FormState = {
  fullName: '', login: '', password: '', confirm: '', departmentId: '', identifier: '', year: '', section: '', designation: '', phone: '',
}

export default function UsersPage({ kind }: { kind: Kind }) {
  const isStudent = kind === 'student'
  const noun = isStudent ? 'student' : 'faculty member'
  const addLabel = isStudent ? 'Add Student' : 'Add Faculty'
  useDocumentTitle(isStudent ? 'Students' : 'Faculty Management')
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
          id: p.id, fullName: p.full_name, login: p.username, identifier: p.faculty_id,
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
  const [deleting, setDeleting] = useState<Row | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const rows = result.data?.rows ?? []

  const confirmToggle = async () => {
    if (!toggling) return
    setToggleBusy(true)
    try {
      await adminUpdateProfile(toggling.id, { is_active: !toggling.active })
      toast.success(`${toggling.fullName} ${toggling.active ? 'disabled' : 'enabled'}.`)
      setToggling(null)
      result.reload()
    } catch (err) {
      toast.error(reportError(err, 'toggle account'))
    } finally {
      setToggleBusy(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await adminDeleteFaculty(deleting.id)
      toast.success(`${deleting.fullName}'s account was deleted.`)
      setDeleting(null)
      result.reload()
    } catch (err) {
      // e.g. "has reviewed certificates … disable the account instead" — written for the administrator
      toast.error(err instanceof AppError ? err.message : reportError(err, 'delete faculty', "We couldn't delete this account."))
      setDeleting(null)
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title={isStudent ? 'Students' : 'Faculty Management'}
        subtitle={result.data ? `${result.data.total} ${result.data.total === 1 ? noun : isStudent ? 'students' : 'faculty'}` : undefined}
        actions={
          <Button onClick={() => setAdding(true)} icon={<Plus className="size-4" aria-hidden />}>
            {addLabel}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="search" aria-label={`Find ${noun}`}>
        <FilterInput
          type="search"
          aria-label={`Search ${isStudent ? 'students' : 'faculty'}`}
          placeholder={isStudent ? 'Name, register number or username…' : 'Name, faculty ID or username…'}
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
            description={isStudent ? 'Students appear here when they register, or you can add them.' : 'Faculty cannot register themselves — add each faculty member here and they can sign in straight away.'}
            action={
              <Button onClick={() => setAdding(true)} icon={<Plus className="size-4" aria-hidden />}>
                {addLabel}
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
                          <span className="font-mono">{r.identifier}</span> · @{r.login}
                        </span>
                      </div>
                    </div>
                  </Td>
                  <Td>{r.departmentName ?? '—'}</Td>
                  <Td>{isStudent ? `${r.year ? `Year ${r.year}` : '—'}${r.section ? ` · ${r.section}` : ''}` : (r.designation ?? '—')}</Td>
                  <Td>
                    <span className={cn('stamp', r.active ? 'border-verified-600/40 bg-verified-50 text-verified-700' : 'border-paper-300 bg-paper-100 text-ink-500')}>
                      {r.active ? 'Active' : 'Disabled'}
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
                        title={r.active ? 'Disable this account' : 'Enable this account'}
                        aria-label={`${r.active ? 'Disable' : 'Enable'} ${r.fullName}`}
                        icon={r.active ? <UserX className="size-3.5" aria-hidden /> : <UserCheck className="size-3.5" aria-hidden />}
                      >
                        <span className="hidden xl:inline">{r.active ? 'Disable' : 'Enable'}</span>
                      </Button>
                      {!isStudent && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleting(r)}
                          title="Delete this account"
                          aria-label={`Delete ${r.fullName}`}
                          icon={<Trash2 className="size-3.5" aria-hidden />}
                        >
                          <span className="hidden xl:inline">Delete</span>
                        </Button>
                      )}
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
        title={toggling?.active ? `Disable ${toggling.fullName}?` : `Enable ${toggling?.fullName}?`}
        confirmLabel={toggling?.active ? 'Disable' : 'Enable'}
        message={
          toggling?.active
            ? 'They will not be able to sign in or use CertiPass until the account is enabled again. Their records are kept.'
            : 'They will be able to sign in again.'
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        loading={deleteBusy}
        danger
        title={`Delete ${deleting?.fullName ?? 'this account'}?`}
        confirmLabel="Delete account"
        message="This permanently removes the account and cannot be undone. A faculty member who has already reviewed certificates or OD requests can't be deleted (that history must stay) — disable the account instead."
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
          fullName: row.fullName, login: row.login, password: '', confirm: '', departmentId: row.departmentId ?? '',
          identifier: row.identifier ?? '', year: row.year ? String(row.year) : '', section: row.section ?? '',
          designation: row.designation ?? '', phone: row.phone ?? '',
        }
      : EMPTY,
  )
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ login: string } | null>(null)

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
      const u = validateUsername(form.login)
      if (u) e.login = u
      const pw = validatePassword(form.password)
      if (pw) e.password = pw
      if (form.confirm !== form.password) e.confirm = 'Passwords do not match.'
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
          username: normalizeUsername(form.login),
          password: form.password,
          fullName: form.fullName.trim(),
          departmentId: form.departmentId,
          ...(isStudent
            ? { registerNumber: form.identifier.trim(), year: Number(form.year), section: form.section.trim() }
            : { facultyId: form.identifier.trim(), designation: form.designation.trim() }),
        })
        onSaved()
        setCreated({ login: normalizeUsername(form.login) })
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

  const title = created
    ? isStudent ? 'Student created' : 'Faculty created'
    : editing ? `Edit ${row.fullName}` : isStudent ? 'Add Student' : 'Add Faculty'

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
              {editing ? 'Save changes' : isStudent ? 'Create Student' : 'Create Faculty'}
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <Alert tone="success" title="The account is ready — they can sign in now">
            Share the username and the password you chose with them securely. The password isn't shown again; if it is
            forgotten you can set a new one from this page (Edit).
          </Alert>
          <dl className="rounded-md border border-paper-200 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wider text-ink-500">Username</dt>
                <dd className="truncate font-medium">{created.login}</dd>
              </div>
              <Button size="sm" variant="secondary" onClick={() => copy(created.login, 'Username')} icon={<Copy className="size-3.5" aria-hidden />}>
                Copy
              </Button>
            </div>
          </dl>
        </div>
      ) : (
        <>
          <form id="account-form" onSubmit={onSubmit} noValidate className="space-y-5">
            {formError && <Alert tone="error">{formError}</Alert>}
            <TextField label="Full Name" required value={form.fullName} onChange={set('fullName')} error={errors.fullName} />
            <TextField
              label="Username"
              required={!editing}
              readOnly={editing}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={form.login}
              onChange={set('login')}
              error={errors.login}
              maxLength={USERNAME_MAX}
              hint={editing ? 'The username is the sign-in name and can’t be changed.' : '3–100 letters, numbers, dots, dashes or underscores; one @ is allowed.'}
            />

            {!editing && (
              <div className="grid gap-5 sm:grid-cols-2">
                <PasswordField
                  label="Password"
                  required
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set('password')}
                  error={errors.password}
                  hint="8+ characters with a letter and a number."
                />
                <PasswordField
                  label="Confirm Password"
                  required
                  autoComplete="new-password"
                  value={form.confirm}
                  onChange={set('confirm')}
                  error={errors.confirm}
                />
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label={isStudent ? 'Register Number' : 'Faculty ID'}
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

            {editing && <TextField label="Phone" type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} />}
          </form>

          {editing && row && <SetPasswordSection userId={row.id} name={row.fullName} />}
        </>
      )}
    </Modal>
  )
}

/** Administrators reset forgotten passwords here (nobody has an e-mail address on file to send a reset link to). */
function SetPasswordSection({ userId, name }: { userId: string; name: string }) {
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    const found = {
      password: validatePassword(password) ?? undefined,
      confirm: confirm !== password ? 'Passwords do not match.' : undefined,
    }
    setErrors(found)
    if (found.password || found.confirm) return
    setBusy(true)
    try {
      await adminSetPassword(userId, password)
      toast.success(`New password set for ${name}.`)
      setPassword('')
      setConfirm('')
    } catch (err) {
      setError(err instanceof AppError ? err.message : reportError(err, 'set password', "We couldn't change the password."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="set-password-title" className="mt-7 space-y-4 border-t border-paper-200 pt-6">
      <div>
        <h3 id="set-password-title" className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-ink-500" aria-hidden />
          Set a new password
        </h3>
        <p className="mt-1 text-xs text-ink-500">For someone who has forgotten theirs. They can change it again from their profile.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-5 sm:grid-cols-2">
        <PasswordField
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            setErrors((cur) => ({ ...cur, password: undefined }))
          }}
          error={errors.password}
        />
        <PasswordField
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            setErrors((cur) => ({ ...cur, confirm: undefined }))
          }}
          error={errors.confirm}
        />
      </div>
      <Button variant="secondary" onClick={save} loading={busy} icon={<KeyRound className="size-4" aria-hidden />}>
        Set new password
      </Button>
    </section>
  )
}
