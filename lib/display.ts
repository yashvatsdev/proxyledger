export const appTimeZone = 'Asia/Kolkata'
export function activityTimestamp(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: appTimeZone }).format(new Date(value))
}
export function calendarDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: appTimeZone }).format(new Date(value))
}
export function dashboardGreeting(value: string) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: appTimeZone }).format(new Date(value)))
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}
