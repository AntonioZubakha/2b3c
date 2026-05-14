import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser } from '../types';
// Не импортируем IUser из types, вместо этого создаем свой базовый интерфейс

// Создаем базовый интерфейс с пользовательскими данными
export interface IUserBase {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  company?: mongoose.Types.ObjectId | any;
  role: string;
  isActive: boolean;
  isLgdealSupervisor: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  lastLogin?: Date;
  // Email верификация
  emailVerified?: boolean;
  emailVerificationToken?: string;
  emailVerificationExpires?: Date;
  // Phone верификация
  phone?: string;
  phoneVerified?: boolean;
  phoneVerificationToken?: string;
  phoneVerificationExpires?: Date;
  phoneVerificationCode?: string;
  // Восстановление пароля
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  /** Telegram chat_id for sending DMs (e.g. password reset link). User must have started the bot. */
  telegramId?: string;
  /** One-time token for "link Telegram" flow. Not sent to client. */
  telegramLinkToken?: string;
  telegramLinkTokenExpires?: Date;
  /**
   * Per-channel toggles for transactional notifications about deal events.
   * Defaults: in-app always on (bell + websocket); email on; telegram on if linked; whatsapp opt-in.
   */
  notificationPrefs?: {
    email?: boolean;
    telegram?: boolean;
    whatsapp?: boolean;
  };
  /** Соль для мигрированных пользователей (старый сайт: bcrypt(plainPassword + '_' + salt)). Не отдавать в API. */
  legacyPasswordSalt?: string;
  cart?: {
    items: Array<{
      product: mongoose.Types.ObjectId;
      dateAdded: Date;
      _id?: mongoose.Types.ObjectId;
    }>;
    updatedAt: Date;
  };
}

// Схема для элемента корзины
const CartItemSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  dateAdded: {
    type: Date,
    default: Date.now
  }
});

// Интерфейс для методов модели User
interface IUserMethods {
  addToCart(productId: mongoose.Types.ObjectId | string): Promise<IUserDocument>;
  removeFromCart(itemId: mongoose.Types.ObjectId | string): Promise<IUserDocument>;
  clearCart(): Promise<IUserDocument>;
}

// Комбинируем базовый интерфейс и методы
export interface IUserDocument extends IUser, IUserMethods {
  toObject<T = this>(): T;
  toJSON<T = this>(): T;
}

// Тип модели пользователя
type UserModel = Model<IUserDocument, {}, IUserMethods>;

// Схема пользователя
const UserSchema = new Schema<IUserDocument, UserModel, IUserMethods>({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  company: {
    type: Schema.Types.ObjectId,
    ref: 'Company'
  },
  role: {
    type: String,
    enum: ['admin', 'supervisor', 'manager', 'logist'],
    default: 'manager'
  },
  isActive: {
    type: Boolean,
    default: false
  },
  /** @deprecated Not used in logic; LGDEAL supervisor is derived from (company === LGDeal INC && (role === 'supervisor' || role === 'admin')). Kept for DB compatibility. */
  isLgdealSupervisor: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  },
  // Email верификация
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  // Phone верификация
  phone: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  phoneVerificationToken: {
    type: String,
    default: null
  },
  phoneVerificationExpires: {
    type: Date,
    default: null
  },
  phoneVerificationCode: {
    type: String,
    default: null
  },
  // Восстановление пароля
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  telegramId: {
    type: String,
    default: null
  },
  telegramLinkToken: {
    type: String,
    default: null
  },
  telegramLinkTokenExpires: {
    type: Date,
    default: null
  },
  notificationPrefs: {
    email: { type: Boolean, default: true },
    telegram: { type: Boolean, default: true },
    whatsapp: { type: Boolean, default: false }
  },
  legacyPasswordSalt: {
    type: String,
    default: null,
    select: false
  },
  // Добавляем корзину как встроенный массив
  cart: {
    items: [CartItemSchema],
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }
});

// Обновляем дату последнего обновления корзины при изменении
UserSchema.pre('save', function(this: IUserDocument, next) {
  if (this.isModified('cart.items')) {
    // Инициализация cart, если он не существует
    if (!this.cart) {
      this.cart = {
        items: [],
        updatedAt: new Date()
      };
    } else {
      this.cart.updatedAt = new Date();
    }
  }
  
  if (this.isNew) {
    this.createdAt = new Date();
  }
  
  this.updatedAt = new Date();
  next();
});

// Define methods interface
interface IUserMethods {
  addToCart(productId: mongoose.Types.ObjectId | string): Promise<IUserDocument>;
  removeFromCart(productId: mongoose.Types.ObjectId | string): Promise<IUserDocument>;
  clearCart(): Promise<IUserDocument>;
}

// Вспомогательные методы для работы с корзиной
UserSchema.methods = {
  addToCart: function(this: IUserDocument, productId: mongoose.Types.ObjectId | string): Promise<IUserDocument> {
  // Инициализация cart, если он не существует
  if (!this.cart) {
    this.cart = {
      items: [],
      updatedAt: new Date()
    };
  }

  const existingItemIndex = this.cart.items.findIndex(
    (item: any) => item.product.toString() === productId.toString()
  );

  if (existingItemIndex >= 0) {
    // Если товар уже в корзине, не добавляем его снова (каждый камень уникален)
    return this.save();
  } else {
    // Добавляем новый товар в корзину (User cart item: product, dateAdded)
    const productObjId = typeof productId === 'string' ? new mongoose.Types.ObjectId(productId) : productId;
    (this.cart.items as unknown as Array<{ product: mongoose.Types.ObjectId; dateAdded: Date }>).push({
      product: productObjId,
      dateAdded: new Date()
    });
  }
  
  this.cart.updatedAt = new Date();
  return this.save();
  },

  removeFromCart: function(this: IUserDocument, itemId: mongoose.Types.ObjectId | string): Promise<IUserDocument> {
  if (!this.cart) {
    this.cart = {
      items: [],
      updatedAt: new Date()
    };
    return this.save();
  }

  this.cart.items = this.cart.items.filter(
    (item: any) => item._id.toString() !== itemId.toString()
  );
  this.cart.updatedAt = new Date();
  return this.save();
  },

  clearCart: function(this: IUserDocument): Promise<IUserDocument> {
  if (!this.cart) {
    this.cart = {
      items: [],
      updatedAt: new Date()
    };
  } else {
    this.cart.items = [];
    this.cart.updatedAt = new Date();
  }
  return this.save();
  }
};

const User = mongoose.model<IUserDocument, UserModel & IUserMethods>('User', UserSchema);

export default User; 