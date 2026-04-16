export const MASTER_ACCESS_EMAILS = ['nauber.biemann@gmail.com'];

const normalizeEmail = (value?: string | null) => (value || '').trim().toLowerCase();

export const isMasterAccessEmail = (value?: string | null) =>
  MASTER_ACCESS_EMAILS.includes(normalizeEmail(value));

