/** Calendar dates only: neither the browser timezone nor elapsed milliseconds define age. */
export function hongKongDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find(p => p.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** ANB used by the supplied Prudential sheets: attained age + 1, not nearest-birthday age.
 * On Feb 29 births, a non-leap year reaches the anniversary at Mar 1 (calendar comparison).
 */
export function ageNextBirthday(birthday: string, asOf = hongKongDate()): number {
  if (!validDate(birthday)) throw Error('请填写有效的出生日期')
  if (!validDate(asOf)) throw Error('测算日期无效')
  if (birthday > asOf) throw Error('出生日期不能晚于今天')
  const yearDifference = Number(asOf.slice(0, 4)) - Number(birthday.slice(0, 4))
  return yearDifference + (asOf.slice(5) >= birthday.slice(5) ? 1 : 0)
}
