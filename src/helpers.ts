/**
 * Utility for enforcing exhaustiveness checks in the type system.
 *
 * @see https://basarat.gitbook.io/typescript/type-system/discriminated-unions#throw-in-exhaustive-checks
 *
 * @param value The variable with no remaining values
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value should never occur: ${value}`);
}

type AllKeys<T> = T extends object ? keyof T : never;

export function pick<O extends object, K extends AllKeys<O>>(base: O, keys: readonly K[]): Pick<O, K> {
  const entries = keys.map((key) => [key, base?.[key]]);
  return Object.fromEntries(entries);
}

export function omit<O extends object, K extends AllKeys<O>>(base: O, keys: readonly K[]): Omit<O, K> {
  const _ = { ...base }
  keys.forEach((key) => delete _[key])
  return _
}

export function isString(x: unknown): x is string {
  return typeof x === 'string' || x instanceof String;
}

export function isObject(o: unknown): o is Record<PropertyKey, unknown> {
  return typeof o === 'object' && o !== null;
}

export function isReadableStream(obj: unknown): obj is NodeJS.ReadStream {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    ((obj as NodeJS.ReadStream).readable || typeof (obj as NodeJS.ReadStream)._read === 'function')
  );
}

export function isBuffer(obj: unknown): obj is Buffer {
  return (
    obj != null &&
    (obj as Buffer).constructor != null &&
    // @ts-expect-error
    typeof obj.constructor.isBuffer === 'function' &&
    // @ts-expect-error
    obj.constructor.isBuffer(obj)
  );
}

export function fileExt(filename: string): string {
  return filename.substring(filename.lastIndexOf('.') + 1, filename.length) || filename
}