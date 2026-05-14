import mongoose, { Schema, Document } from 'mongoose';

export interface IInvitationDocument extends Document {
	email: string;
	company: mongoose.Types.ObjectId;
	status: 'pending' | 'sent' | 'revoked' | 'accepted';
	token?: string | null;
	lastSentAt?: Date | null;
	sendCount: number;
	expiresAt?: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitationDocument>({
	email: { type: String, required: true, lowercase: true, trim: true, index: true },
	company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
	status: { type: String, enum: ['pending', 'sent', 'revoked', 'accepted'], default: 'pending', index: true },
	token: { type: String, default: null },
	lastSentAt: { type: Date, default: null },
	sendCount: { type: Number, default: 0 },
	expiresAt: { type: Date, default: null },
}, { timestamps: true });

InvitationSchema.index({ email: 1, company: 1 }, { unique: true, partialFilterExpression: { status: { $ne: 'accepted' } } });
InvitationSchema.index({ token: 1 }, { sparse: true });

const Invitation = mongoose.model<IInvitationDocument>('Invitation', InvitationSchema);

export default Invitation;


