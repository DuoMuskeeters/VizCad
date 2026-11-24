export const optionalString = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined)
