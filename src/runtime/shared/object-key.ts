export const OBJECT_KEY_MAX_LENGTH = 1024

export function isSafeObjectKeyPath(key: string): boolean {
   return !key.includes('..') && !key.startsWith('/')
}

export function isObjectKey(value: unknown): value is string {
   return (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= OBJECT_KEY_MAX_LENGTH &&
      isSafeObjectKeyPath(value)
   )
}
