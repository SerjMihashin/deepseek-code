import { describe, expect, it } from 'vitest'
import { checkNodeVersion, formatDoctorReport, type DoctorCheck } from './doctor.js'

describe('checkNodeVersion', () => {
  it('passes for Node 20+', () => {
    expect(checkNodeVersion('20.11.0')).toMatchObject({ status: 'ok', detail: 'v20.11.0' })
    expect(checkNodeVersion('22.1.0').status).toBe('ok')
  })

  it('fails below Node 20', () => {
    const check = checkNodeVersion('18.19.0')
    expect(check.status).toBe('fail')
    expect(check.detail).toContain('required')
  })
})

describe('formatDoctorReport', () => {
  const ok: DoctorCheck = { name: 'A', status: 'ok', detail: 'fine' }
  const warn: DoctorCheck = { name: 'B', status: 'warn', detail: 'meh' }
  const fail: DoctorCheck = { name: 'C', status: 'fail', detail: 'broken' }

  it('reports all-green', () => {
    const report = formatDoctorReport([ok])
    expect(report).toContain('[ok] **A** — fine')
    expect(report).toContain('All systems go.')
  })

  it('counts warnings and failures', () => {
    expect(formatDoctorReport([ok, warn])).toContain('1 warning(s)')
    expect(formatDoctorReport([ok, warn, fail])).toContain('1 problem(s) need fixing')
  })
})
