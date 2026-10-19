import { HttpError } from './http-error.js';

export function text(value, label, max, optional = false) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.trim().length > max || (!optional && !value.trim())) {
    throw new HttpError(400, 'validation.text', { field: label, max });
  }
  return value.trim();
}

export function username(value) {
  const result = text(value, 'fields.username', 254).toLowerCase();
  if (/\s/.test(result)) throw new HttpError(400, 'validation.username');
  return result;
}

export function password(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) {
    throw new HttpError(400, 'validation.passwordLength');
  }
  return value;
}

export function id(value) {
  if (!(typeof value === 'number' || typeof value === 'string') || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new HttpError(400, 'validation.id');
  }
  return Number(value);
}

export function date(value, timeZone = 'Europe/Rome') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'validation.date');
  const parsed = new Date(`${value}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > today) {
    throw new HttpError(400, 'validation.dateRange');
  }
  return value;
}

export function amount(value) {
  if (typeof value !== 'string' || !/^\d{1,7}([.,]\d{1,2})?$/.test(value)) throw new HttpError(400, 'validation.amount');
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (cents <= 0 || cents > 100000000) throw new HttpError(400, 'validation.amountRange');
  return cents;
}

export function waste(body) {
  const name = text(body.name, 'fields.wasteName', 100);
  const instructions = text(body.instructions, 'fields.instructions', 2000, true);
  if (!Array.isArray(body.days) || !body.days.length || body.days.length > 7 || body.days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new HttpError(400, 'validation.wasteDays');
  }
  return { name, instructions, days: [...new Set(body.days)].sort() };
}
