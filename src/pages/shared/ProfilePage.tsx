import { useRef, useState, type FormEvent } from 'react'
import { Camera, KeyRound, Save } from 'lucide-react'
import {
  Alert,
  Avatar,
  Button,
  PageHeader,
  PasswordField,
  SectionCard,
  SelectField,
  TextField,
  useToast,
} from '@/components/ui'
import { useAuth, useProfile } from '@/contexts/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { reportError } from '@/lib/errors'
import { updatePassword, validatePassword } from '@/services/authService'
import { updateProfile, uploadAvatar } from '@/services/profileService'
import { formatBytes } from '@/lib/utils'
import { ROLE_LABEL } from '@/components/layout/navigation'

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const AVATAR_MAX = 2 * 1024 * 1024

export default function ProfilePage() {
  useDocumentTitle('Profile')
  const profile = useProfile()
  const { setProfile } = useAuth()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const isStudent = profile.role === 'student'
  const isFaculty = profile.role === 'faculty'

  const [fullName, setFullName] = useState(profile.full_name)
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [year, setYear] = useState(profile.year ? String(profile.year) : '')
  const [section, setSection] = useState(profile.section ?? '')
  const [designation, setDesignation] = useState(profile.designation ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [pw, setPw] = useState({ next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<{ next?: string; confirm?: string }>({})
  const [pwSaving, setPwSaving] = useState(false)

  const onSave = async (e: FormEvent) => {
    e.preventDefault()
    const found: Record<string, string> = {}
    if (fullName.trim().length < 2) found.fullName = 'Enter your full name.'
    if (phone.trim() && !/^[0-9+()\- ]{7,20}$/.test(phone.trim())) found.phone = 'Enter a valid phone number.'
    if (isStudent && !year) found.year = 'Choose your year.'
    if (isStudent && !section.trim()) found.section = 'Enter your section.'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    try {
      const updated = await updateProfile(profile.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        ...(isStudent ? { year: Number(year), section: section.trim() } : {}),
        ...(isFaculty ? { designation: designation.trim() || null } : {}),
      })
      setProfile(updated)
      toast.success('Profile updated.')
    } catch (err) {
      toast.error(reportError(err, 'update profile', "We couldn't save your profile."))
    } finally {
      setSaving(false)
    }
  }

  const onAvatar = async (file: File) => {
    if (!AVATAR_TYPES.includes(file.type)) return void toast.error('Use a JPG, PNG or WebP image.')
    if (file.size > AVATAR_MAX) return void toast.error(`That photo is ${formatBytes(file.size)}. The maximum is 2 MB.`)
    setUploading(true)
    try {
      const url = await uploadAvatar(profile.id, file)
      const updated = await updateProfile(profile.id, { avatar_url: url })
      setProfile(updated)
      toast.success('Profile photo updated.')
    } catch (err) {
      toast.error(reportError(err, 'upload avatar', "We couldn't upload that photo."))
    } finally {
      setUploading(false)
    }
  }

  const onPassword = async (e: FormEvent) => {
    e.preventDefault()
    const found = {
      next: validatePassword(pw.next) ?? undefined,
      confirm: pw.confirm !== pw.next ? 'Passwords do not match.' : undefined,
    }
    setPwErrors(found)
    if (found.next || found.confirm) return
    setPwSaving(true)
    try {
      await updatePassword(pw.next)
      setPw({ next: '', confirm: '' })
      toast.success('Password changed.')
    } catch (err) {
      toast.error(reportError(err, 'change password'))
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow={ROLE_LABEL[profile.role]} title="Profile" subtitle="Keep your details current — faculty see these when reviewing your submissions." />

      <div className="space-y-6">
        <SectionCard title="Photo">
          <div className="flex items-center gap-5">
            <Avatar name={profile.full_name} src={profile.avatar_url} size="xl" />
            <div>
              <input
                ref={fileRef}
                type="file"
                accept={AVATAR_TYPES.join(',')}
                className="sr-only"
                tabIndex={-1}
                aria-label="Choose profile photo"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void onAvatar(f)
                }}
              />
              <Button variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()} icon={<Camera className="size-4" aria-hidden />}>
                {profile.avatar_url ? 'Change photo' : 'Upload photo'}
              </Button>
              <p className="mt-2 text-xs text-ink-500">JPG, PNG or WebP · up to 2 MB</p>
            </div>
          </div>
        </SectionCard>

        <form onSubmit={onSave} noValidate>
          <SectionCard
            title="Personal details"
            action={
              <Button type="submit" loading={saving} icon={<Save className="size-4" aria-hidden />}>
                Save changes
              </Button>
            }
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField wrapperClassName="sm:col-span-2" label="Full name" required value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} />
              <TextField label="Username" value={profile.username} readOnly hint="This is how you sign in. Contact your administrator to change it." />
              <TextField label="Phone number" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />

              {isStudent && (
                <>
                  <TextField label="Register number" value={profile.register_number ?? ''} readOnly />
                  <TextField label="Department" value={profile.department?.name ?? ''} readOnly />
                  <SelectField label="Year" required value={year} onChange={(e) => setYear(e.target.value)} error={errors.year}>
                    <option value="">Select…</option>
                    {[1, 2, 3, 4].map((y) => (
                      <option key={y} value={y}>
                        Year {y}
                      </option>
                    ))}
                  </SelectField>
                  <TextField label="Section" required value={section} onChange={(e) => setSection(e.target.value)} error={errors.section} maxLength={10} />
                </>
              )}

              {isFaculty && (
                <>
                  <TextField label="Faculty ID" value={profile.faculty_id ?? ''} readOnly />
                  <TextField label="Department" value={profile.department?.name ?? ''} readOnly />
                  <TextField wrapperClassName="sm:col-span-2" label="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} placeholder="e.g. Assistant Professor" maxLength={80} />
                </>
              )}
            </div>
          </SectionCard>
        </form>

        <form onSubmit={onPassword} noValidate>
          <SectionCard title="Change password">
            <div className="space-y-5">
              <Alert tone="info">You’ll stay signed in on this device after changing your password.</Alert>
              <div className="grid gap-5 sm:grid-cols-2">
                <PasswordField
                  label="New password"
                  autoComplete="new-password"
                  value={pw.next}
                  onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
                  error={pwErrors.next}
                  hint="8+ characters, with a letter and a number."
                />
                <PasswordField
                  label="Confirm new password"
                  autoComplete="new-password"
                  value={pw.confirm}
                  onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
                  error={pwErrors.confirm}
                />
              </div>
              <Button type="submit" variant="secondary" loading={pwSaving} icon={<KeyRound className="size-4" aria-hidden />}>
                Update password
              </Button>
            </div>
          </SectionCard>
        </form>
      </div>
    </div>
  )
}
