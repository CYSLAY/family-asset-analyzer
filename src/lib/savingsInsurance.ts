export const SAVINGS_INSURANCE_REFERENCE_ANNUAL_PREMIUM = 500000
export const SAVINGS_INSURANCE_PAYMENT_YEARS = 5

// Reference illustration supplied by the user: annual RMB 500,000 contribution,
// five contribution years. Blank policy values in the first three years are 0.
const referenceBalances = [
  0, 0, 0, 622290, 964294, 1283208, 1884870, 2180915, 2672356, 2895647,
  3196573, 3383603, 3705538, 4021116, 4356353, 4724257, 5027323, 5406583, 5867804, 6330225,
  6929636, 7588033, 8104644, 8854538, 9560684, 10338613, 11145823, 12029597, 12902919, 13741550,
  14634771, 15581341, 16594529, 17673595, 18822803, 20046920, 21350452, 22738675, 24217344, 25791976,
  27469092, 29254954, 31157077, 33182978, 35340428, 37638184, 40085268, 42691452, 45467002, 48422936,
  51571015, 54923517, 58494460, 62297115, 66346997, 70660377,
] as const

const referenceIrr = [
  null, null, null, null, null, null, null, null, 1.1, 2.1,
  3.1, 3.4, 4.0, 4.4, 4.7, 5.0, 5.1, 5.3, 5.5, 5.6,
  5.8, 6.0, 6.0, 6.2, 6.3, 6.3, 6.4,
] as const

export interface SavingsInsuranceYear {
  premium: number
  balance: number
  irr: number | null
}

export function savingsInsuranceYear(annualPremium: number | undefined, offset: number): SavingsInsuranceYear {
  const premiumAmount = Math.max(0, Number.isFinite(annualPremium) ? Number(annualPremium) : 0)
  if (premiumAmount === 0 || offset < 0) return { premium: 0, balance: 0, irr: null }
  const scale = premiumAmount / SAVINGS_INSURANCE_REFERENCE_ANNUAL_PREMIUM
  const referenceBalance = referenceBalances[offset] ?? 0
  return {
    premium: offset < SAVINGS_INSURANCE_PAYMENT_YEARS ? premiumAmount : 0,
    balance: referenceBalance * scale,
    irr: referenceIrr[offset] ?? (offset >= 27 && offset < referenceBalances.length ? 6.5 : null),
  }
}
