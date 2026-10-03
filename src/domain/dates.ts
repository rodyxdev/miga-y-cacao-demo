export function businessDate(instant: string, days = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(instant));
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  const date = new Date(`${value('year')}-${value('month')}-${value('day')}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}
