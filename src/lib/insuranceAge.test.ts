import { expect, it } from 'vitest'
import { ageNextBirthday, hongKongDate } from './insuranceAge'

it('uses age next birthday before, on and after the birthday', () => {
  expect(ageNextBirthday('1990-09-08', '2026-09-07')).toBe(36)
  expect(ageNextBirthday('1990-09-08', '2026-09-08')).toBe(37)
  expect(ageNextBirthday('1990-09-08', '2026-09-09')).toBe(37)
  expect(ageNextBirthday('2026-09-08', '2026-09-08')).toBe(1)
})
it('handles year and leap-day boundaries using calendar dates', () => {
  expect(ageNextBirthday('1990-01-01', '2025-12-31')).toBe(36)
  expect(ageNextBirthday('1990-01-01', '2026-01-01')).toBe(37)
  expect(ageNextBirthday('2000-02-29', '2024-02-28')).toBe(24)
  expect(ageNextBirthday('2000-02-29', '2024-02-29')).toBe(25)
  expect(ageNextBirthday('2000-02-29', '2025-02-28')).toBe(25)
  expect(ageNextBirthday('2000-02-29', '2025-03-01')).toBe(26)
})
it('rejects impossible, incomplete and future dates', () => {
  for (const date of ['', '2000-02', '2025-02-29', '1900-02-29', '2000-13-01', '2000-01-00', '2027-01-01']) {
    expect(() => ageNextBirthday(date, '2026-09-08')).toThrow()
  }
})
it('uses Hong Kong date regardless of UTC day', () => {
  expect(hongKongDate(new Date('2026-09-07T15:59:59Z'))).toBe('2026-09-07')
  expect(hongKongDate(new Date('2026-09-07T16:00:00Z'))).toBe('2026-09-08')
})
