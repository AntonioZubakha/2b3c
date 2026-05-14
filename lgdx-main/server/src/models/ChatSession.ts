import mongoose, { Document, Schema } from 'mongoose';

export interface IChatSession extends Document {
  _id: mongoose.Types.ObjectId;
  /** Set for logged-in users; null for guest sessions */
  userId?: mongoose.Types.ObjectId | null;
  /** Unique id for guest (cookie/token); set when userId is null */
  guestId?: string;
  /** True when session is from a non-logged-in visitor */
  isGuest?: boolean;
  status: 'active' | 'waiting' | 'closed';
  assignedTo?: mongoose.Types.ObjectId; // Support agent ID
  priority: 'low' | 'medium' | 'high' | 'urgent';
  subject?: string;
  tags: string[];
  /** When true and global AI is on, AI may reply in this chat */
  aiEnabled?: boolean;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    referrer?: string;
    pageUrl?: string;
  };
}

const ChatSessionSchema = new Schema<IChatSession>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null,
    index: true
  },
  guestId: {
    type: String,
    required: false,
    index: true,
    sparse: true
  },
  isGuest: {
    type: Boolean,
    default: false,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'waiting', 'closed'],
    default: 'active',
    index: true
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true
  },
  subject: {
    type: String,
    maxlength: 200
  },
  tags: [{
    type: String,
    maxlength: 50
  }],
  aiEnabled: {
    type: Boolean,
    default: true,
    index: true
  },
  lastMessageAt: {
    type: Date,
    index: true
  },
  closedAt: {
    type: Date
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    referrer: String,
    pageUrl: String
  }
}, {
  timestamps: true,
  collection: 'chatsessions'
});

// Indexes for efficient queries
ChatSessionSchema.index({ userId: 1, status: 1 });
ChatSessionSchema.index({ guestId: 1, status: 1 });
ChatSessionSchema.index({ assignedTo: 1, status: 1 });
ChatSessionSchema.index({ lastMessageAt: -1 });
ChatSessionSchema.index({ createdAt: -1 });

// Virtual for unread message count
ChatSessionSchema.virtual('unreadCount', {
  ref: 'ChatMessage',
  localField: '_id',
  foreignField: 'sessionId',
  count: true,
  match: { isRead: false, sender: 'support' }
});

// Ensure virtual fields are serialized
ChatSessionSchema.set('toJSON', { virtuals: true });
ChatSessionSchema.set('toObject', { virtuals: true });

export default mongoose.model<IChatSession>('ChatSession', ChatSessionSchema);
