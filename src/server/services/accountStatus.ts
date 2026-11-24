/** A ban holds while `banned` is set and `banExpires` is empty or in the future. */
export const isBanned = (row: { banned: boolean | null; banExpires: Date | null } | undefined, now = Date.now()) =>
  row?.banned === true && (row.banExpires === null || row.banExpires.getTime() > now)
