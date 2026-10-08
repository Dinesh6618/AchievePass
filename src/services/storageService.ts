import { supabase } from '@/lib/supabase'
import { env } from '@/lib/env'
import { AppError } from '@/lib/errors'
import { formatBytes, randomId, safeFileName } from '@/lib/utils'

export const CERTIFICATE_BUCKET = 'certificates'
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png'] as const
export type AcceptedMime = (typeof ACCEPTED_MIME)[number]
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'

const EXT_TO_MIME: Record<string, AcceptedMime> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** Browsers occasionally leave `file.type` empty (e.g. some Android pickers); fall back to the extension. */
export function resolveMime(file: File): AcceptedMime | null {
  if ((ACCEPTED_MIME as readonly string[]).includes(file.type)) return file.type as AcceptedMime
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_TO_MIME[ext] ?? null
}

/** Returns a user-facing problem with the file, or null when it can be uploaded. */
export function validateUpload(file: File): string | null {
  if (file.size === 0) return 'This file is empty. Choose another file.'
  if (!resolveMime(file)) return 'Unsupported file type. Upload a PDF, JPG or PNG.'
  if (file.size > MAX_UPLOAD_BYTES) {
    return `This file is ${formatBytes(file.size)}. The maximum size is ${formatBytes(MAX_UPLOAD_BYTES)}.`
  }
  return null
}

export function buildStoragePath(userId: string, fileName: string, folder?: string): string {
  const name = `${randomId()}-${safeFileName(fileName)}`
  return folder ? `${userId}/${folder}/${name}` : `${userId}/${name}`
}

export async function sha256Hex(file: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null // crypto.subtle is unavailable on insecure origins; hashing is optional
  }
}

/**
 * Uploads with a real progress signal. supabase-js's upload() has no progress
 * callback, so this talks to the Storage REST endpoint directly through XHR
 * (same endpoint and auth headers the SDK uses).
 */
export async function uploadWithProgress(
  path: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
  bucket: string = CERTIFICATE_BUCKET,
): Promise<void> {
  const mime = resolveMime(file)
  if (!mime) throw new AppError('Unsupported file type. Upload a PDF, JPG or PNG.')

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new AppError('Your session has expired. Please sign in again.')

  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const url = `${env.supabaseUrl}/storage/v1/object/${bucket}/${encodedPath}`

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', env.supabaseAnonKey)
    xhr.setRequestHeader('Content-Type', mime)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', 'max-age=3600')

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1)
        resolve()
        return
      }
      let message = `Upload failed (${xhr.status})`
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string }
        message = body.message ?? body.error ?? message
      } catch {
        // non-JSON error body
      }
      reject({ message, status: xhr.status })
    }
    xhr.onerror = () => reject(new TypeError('Failed to fetch'))
    xhr.onabort = () => reject(new AppError('Upload cancelled.', 'aborted'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })

    xhr.send(file)
  })
}

export async function createSignedUrl(path: string, expiresInSeconds = 600, bucket: string = CERTIFICATE_BUCKET) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

/** Best-effort cleanup — a leftover file must never block the user's main action. */
export async function removeFiles(paths: (string | null | undefined)[], bucket: string = CERTIFICATE_BUCKET) {
  const list = paths.filter((p): p is string => Boolean(p))
  if (list.length === 0) return
  const { error } = await supabase.storage.from(bucket).remove(list)
  if (error) console.warn('[CertiPass] could not remove stored file(s)', error)
}
