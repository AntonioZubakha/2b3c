/**
 * Mongoose Type Helpers
 * 
 * Утилиты для безопасной работы с Mongoose документами и populated полями
 */

import { Types, Document } from 'mongoose';

/**
 * Извлекает ObjectId из Mongoose поля (populated или нет)
 * 
 * @example
 * const productId = extractObjectId(product); // Types.ObjectId
 * const companyId = extractObjectId(user.company); // Types.ObjectId | undefined
 */
export function extractObjectId<T extends { _id?: Types.ObjectId | string }>(
  value: Types.ObjectId | T | string | null | undefined
): Types.ObjectId | undefined {
  if (!value) return undefined;
  
  // Если это уже ObjectId
  if (value instanceof Types.ObjectId) {
    return value;
  }
  
  // Если это строка
  if (typeof value === 'string') {
    return new Types.ObjectId(value);
  }
  
  // Если это объект с _id
  if (typeof value === 'object' && '_id' in value && value._id) {
    if (value._id instanceof Types.ObjectId) {
      return value._id;
    }
    if (typeof value._id === 'string') {
      return new Types.ObjectId(value._id);
    }
  }
  
  return undefined;
}

/**
 * Type guard для проверки что поле является populated документом
 * 
 * @example
 * if (isPopulated(user.company)) {
 *   console.log(user.company.name); // Безопасно - TypeScript знает что это объект
 * }
 */
export function isPopulated<T extends Document>(
  value: Types.ObjectId | T | null | undefined
): value is T {
  return value != null && typeof value === 'object' && !(value instanceof Types.ObjectId);
}

/**
 * Type guard для проверки что поле НЕ populated (это ObjectId)
 */
export function isObjectId(
  value: Types.ObjectId | any | null | undefined
): value is Types.ObjectId {
  return value instanceof Types.ObjectId;
}

/**
 * Безопасно получает строковое представление ObjectId
 * 
 * @example
 * const id = toObjectIdString(product); // string | undefined
 * const companyId = toObjectIdString(user.company); // string | undefined
 */
export function toObjectIdString(
  value: Types.ObjectId | { _id?: Types.ObjectId | string } | string | null | undefined
): string | undefined {
  const objectId = extractObjectId(value);
  return objectId?.toString();
}

/**
 * Проверяет равенство двух ObjectId (работает с populated и непopulated полями)
 * 
 * @example
 * if (areObjectIdsEqual(product.company, user.company)) {
 *   console.log('Same company!');
 * }
 */
export function areObjectIdsEqual(
  a: Types.ObjectId | { _id?: Types.ObjectId | string } | string | null | undefined,
  b: Types.ObjectId | { _id?: Types.ObjectId | string } | string | null | undefined
): boolean {
  const idA = toObjectIdString(a);
  const idB = toObjectIdString(b);
  
  if (!idA || !idB) return false;
  return idA === idB;
}

/**
 * Generic тип для Mongoose поля которое может быть populated или нет
 */
export type PopulatedField<T extends Document> = Types.ObjectId | T;

/**
 * Generic тип для опционального Mongoose поля
 */
export type OptionalPopulatedField<T extends Document> = Types.ObjectId | T | null | undefined;

