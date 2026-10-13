export function getDateTimeFormat (): typeof Intl.DateTimeFormat | undefined {
  return (typeof Intl !== 'undefined' ? Intl.DateTimeFormat : undefined)
}
