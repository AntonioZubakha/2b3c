import mongoose, { Schema, Document, Model } from 'mongoose';

/**
 * Interface for Counter document
 */
export interface ICounter extends Document {
  name: string;
  value: number;
  prefix: string;
  suffix: string;
}

/**
 * Interface for Counter model with static methods
 */
interface ICounterModel extends Model<ICounter> {
  getNextValue(counterName: string, startValue?: number, digits?: number): Promise<string>;
}

/**
 * Counter model for generating sequential IDs for different entities
 */
const counterSchema = new Schema<ICounter>({
  // Name of the counter (e.g., 'buyerDealNumber', 'sellerDealNumber')
  name: {
    type: String,
    required: true,
    unique: true
  },
  // Current value of the counter
  value: {
    type: Number,
    required: true,
    default: 0
  },
  // Optional prefix for generated IDs
  prefix: {
    type: String,
    default: ''
  },
  // Optional suffix for generated IDs
  suffix: {
    type: String,
    default: ''
  }
});

/**
 * Get the next value for a counter and increment it
 * @param {string} counterName - Name of the counter
 * @param {number} startValue - Starting value if counter doesn't exist
 * @param {number} digits - Number of digits to pad the value to
 * @returns {Promise<string>} - Formatted next value
 */
counterSchema.statics.getNextValue = async function(
  counterName: string, 
  startValue: number = 1, 
  digits: number = 6
): Promise<string> {
  const counter = await this.findOneAndUpdate(
    { name: counterName },
    { $inc: { value: 1 } },
    { 
      new: true, // Return updated document
      upsert: true, // Create if doesn't exist
      setDefaultsOnInsert: true
    }
  );
  
  // If this is a newly created counter, set the value to the startValue
  if (counter.value === 1 && startValue !== 1) {
    counter.value = startValue;
    await counter.save();
  }
  
  // Format the value with leading zeros
  return counter.value.toString().padStart(digits, '0');
};

export default mongoose.model<ICounter, ICounterModel>('Counter', counterSchema); 