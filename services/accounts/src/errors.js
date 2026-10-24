export class AccountError extends Error {
  constructor(status, message, errors) { super(message); this.status = status; this.errors = errors; }
}
export const invalid = (field, message) => { throw new AccountError(422, message, { [field]: [message] }); };
export function validId(value) { return /^\d{1,19}$/.test(String(value)) && BigInt(value) > 0n && BigInt(value)<=9223372036854775807n; }
export function text(value, field, max = 255) {
  if (typeof value !== 'string' || Array.from(value).length > max) invalid(field, `must be text of at most ${max} characters.`);
  return value;
}
