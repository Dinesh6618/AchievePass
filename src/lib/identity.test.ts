import { describe, expect, it } from 'vitest'
import { INTERNAL_EMAIL_DOMAIN, normalizeUsername, usernameToAuthEmail, validateUsername } from './identity'

describe('validateUsername', () => {
  it('accepts sensible usernames, including the examples from the spec', () => {
    for (const ok of ['dinesh2024', 'akshaya2025', 'student001', 'a.b-c_d', 'Dinesh2024', '  padded  ', 'x1y', 'a'.repeat(100)]) {
      expect(validateUsername(ok), ok).toBeNull()
    }
  })

  it('accepts a college-e-mail-style username (one @), which is just a name here', () => {
    for (const ok of ['dinesh.g.2024.aids@rajalakshmi.edu.in', 'Dinesh.G.2024.AIDS@Rajalakshmi.edu.in', ' name@college.edu ', 'a@b', `${'a'.repeat(60)}@${'b'.repeat(39)}`]) {
      expect(validateUsername(ok), ok).toBeNull()
    }
  })

  it('explains what is wrong', () => {
    expect(validateUsername('')).toMatch(/enter a username/i)
    expect(validateUsername('ab')).toMatch(/at least 3/i)
    expect(validateUsername('a'.repeat(101))).toMatch(/100 characters or fewer/i)
    expect(validateUsername('has space')).toMatch(/no spaces/i)
    expect(validateUsername('semi;colon')).toMatch(/only letters/i)
    expect(validateUsername('a@b@c.edu')).toMatch(/only one @/i)
    expect(validateUsername('two..dots')).toMatch(/two dots/i)
    expect(validateUsername('.leading')).toMatch(/start and end/i)
    expect(validateUsername('trailing-')).toMatch(/start and end/i)
    expect(validateUsername('@college.edu')).toMatch(/start and end/i)
    expect(validateUsername('name@')).toMatch(/start and end/i)
    expect(validateUsername('name@.edu')).toMatch(/start and end/i)
    expect(validateUsername('Admin')).toMatch(/reserved/i)
  })
})

describe('usernameToAuthEmail', () => {
  it('derives a stable, lower-case internal address from the username', () => {
    expect(usernameToAuthEmail('Dinesh2024')).toBe('dinesh2024@certipass.invalid')
    expect(usernameToAuthEmail('  dinesh2024 ')).toBe(usernameToAuthEmail('DINESH2024'))
    expect(normalizeUsername(' MiXeD ')).toBe('mixed')
  })

  it('writes the "@" of an e-mail-style username as "+", so the result is always one valid address', () => {
    const addr = usernameToAuthEmail('Dinesh.G.2024.AIDS@Rajalakshmi.edu.in')
    expect(addr).toBe('dinesh.g.2024.aids+rajalakshmi.edu.in@certipass.invalid')
    expect(addr.split('@')).toHaveLength(2)
    // even the longest allowed username stays well inside Supabase Auth's 255-character limit for an address
    expect(usernameToAuthEmail('a'.repeat(60) + '@' + 'b'.repeat(39)).length).toBeLessThanOrEqual(255)
  })

  it('never maps two different usernames to the same address', () => {
    expect(usernameToAuthEmail('a@b')).not.toBe(usernameToAuthEmail('a.b'))
    expect(usernameToAuthEmail('a@b')).not.toBe(usernameToAuthEmail('a-b'))
    expect(usernameToAuthEmail('a@b')).not.toBe(usernameToAuthEmail('a_b'))
  })

  it('uses a domain that can never receive mail', () => {
    expect(INTERNAL_EMAIL_DOMAIN.endsWith('.invalid')).toBe(true) // RFC 2606 reserved TLD
  })
})
