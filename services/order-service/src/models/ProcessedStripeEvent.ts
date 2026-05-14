import mongoose, { Schema } from 'mongoose';

/** Dedup Stripe webhook deliveries (same event.id may be POSTed more than once). */
const ProcessedStripeEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true }
  },
  { timestamps: true }
);

export const ProcessedStripeEvent =
  mongoose.models.ProcessedStripeEvent ||
  mongoose.model('ProcessedStripeEvent', ProcessedStripeEventSchema);
