/**
 * Advanced Utility Types for TypeScript
 * Useful patterns for improving type safety across the project
 */

import { Types } from 'mongoose';

/**
 * Make specific fields required
 * Example: RequireFields<IProduct, 'certificateNumber' | 'price'>
 */
export type RequireFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific fields optional
 * Example: OptionalFields<IProduct, '_id' | 'createdAt'>
 */
export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Ensure all values in object are not null/undefined
 * Example: NonNullableFields<{ name?: string; age?: number }> => { name: string; age: number }
 */
export type NonNullableFields<T> = {
  [P in keyof T]-?: NonNullable<T[P]>;
};

/**
 * Extract only fields of specific type
 * Example: FieldsOfType<IProduct, number> => { carat: number; price: number; ... }
 */
export type FieldsOfType<T, FieldType> = {
  [K in keyof T as T[K] extends FieldType ? K : never]: T[K];
};

/**
 * Strict Record type that doesn't allow undefined values
 * Better than Record<string, T> which allows undefined
 */
export type StrictRecord<K extends string | number | symbol, T> = {
  [P in K]: T;
};

/**
 * Deep partial - makes all nested fields optional
 * Useful for update operations
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * ObjectId or populated document
 * Common pattern in Mongoose schemas
 */
export type RefOrPopulated<T> = Types.ObjectId | T;

/**
 * Array of ObjectId or populated documents
 * Common pattern in Mongoose array refs
 */
export type RefArrayOrPopulated<T> = Array<Types.ObjectId | T>;

/**
 * Ensure type is an array
 */
export type EnsureArray<T> = T extends unknown[] ? T : T[];

/**
 * Extract promise result type
 */
export type Awaited<T> = T extends Promise<infer U> ? U : T;

/**
 * Function that might throw
 * Explicitly marks functions that can throw errors
 */
export type ThrowableFunction<Args extends unknown[], Return> = (...args: Args) => Return | never;

/**
 * Safe JSON parse result
 * Represents result of JSON.parse with unknown type
 */
export type JsonParseable = string | number | boolean | null | { [key: string]: JsonParseable } | JsonParseable[];

/**
 * Type-safe Object.keys
 * Returns typed array of keys instead of string[]
 */
export function typedKeys<T extends object>(obj: T): Array<keyof T> {
  return Object.keys(obj) as Array<keyof T>;
}

/**
 * Type-safe Object.entries
 * Returns properly typed entries
 */
export function typedEntries<T extends object>(obj: T): Array<[keyof T, T[keyof T]]> {
  return Object.entries(obj) as Array<[keyof T, T[keyof T]]>;
}

/**
 * Type-safe Object.values
 * Returns properly typed values
 */
export function typedValues<T extends object>(obj: T): Array<T[keyof T]> {
  return Object.values(obj) as Array<T[keyof T]>;
}

/**
 * Type guard for non-null/undefined values
 * Useful in array filter: items.filter(isNotNullish)
 */
export function isNotNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard for string values
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for number values
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Type guard for boolean values
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard for object (not array, not null)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard for Error instances
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Safe type assertion with runtime check
 * Throws if assertion fails
 */
export function assertType<T>(value: unknown, guard: (v: unknown) => v is T, errorMessage: string): asserts value is T {
  if (!guard(value)) {
    throw new TypeError(errorMessage);
  }
}

/**
 * Example usage of utility types:
 * 
 * // Require specific fields
 * type ProductWithPrice = RequireFields<IProduct, 'price' | 'certificateNumber'>;
 * 
 * // Extract numeric fields
 * type ProductNumbers = FieldsOfType<IProduct, number>;
 * 
 * // Type-safe object iteration
 * const keys = typedKeys(product); // Array<keyof IProduct>
 * const entries = typedEntries(product); // Array<[keyof IProduct, value]>
 * 
 * // Filter arrays safely
 * const products = await Product.find().lean();
 * const withCerts = products
 *   .map(p => p.certificateNumber)
 *   .filter(isNotNullish); // string[]
 */

