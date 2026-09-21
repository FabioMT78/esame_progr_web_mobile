import { isValidIsoDate } from './date.js';

const euroFormatter = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR'
});

const monthYearFormatter = new Intl.DateTimeFormat('it-IT', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

export function formatIsoDate(value, fallback = '—') {
  if (!value) return fallback;
  if (!isValidIsoDate(value)) return String(value);

  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function formatEuro(value, fallback = '—') {
  const amount = Number(value);
  return Number.isFinite(amount) ? euroFormatter.format(amount) : fallback;
}

export function formatMonthYear(year, month, fallback = '—') {
  const normalizedYear = Number(year);
  const normalizedMonth = Number(month);

  if (!Number.isInteger(normalizedYear)
      || !Number.isInteger(normalizedMonth)
      || normalizedMonth < 1
      || normalizedMonth > 12) {
    return fallback;
  }

  return monthYearFormatter.format(
    new Date(Date.UTC(normalizedYear, normalizedMonth - 1, 1))
  );
}
