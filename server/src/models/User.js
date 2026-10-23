import mongoose from 'mongoose';
import { BLOOD_GROUPS } from '../utils/compatibility.js';

// GeoJSON point. Coordinates are [longitude, latitude] (note the order).
// `default: undefined` stops Mongoose creating an empty array, which would break the geo index.
export const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: {
      type: [Number],
      default: undefined,
      required: true,
      validate: {
        validator: (c) =>
          Array.isArray(c) && c.length === 2 && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90,
        message: 'coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, unique: true, trim: true },
    // True once they've proved they own the number with a one-time code (at sign-up or a code login)
    phoneVerified: { type: Boolean, default: false },
    // When they confirmed they're 18+ and agreed to the terms and privacy policy (consent record)
    termsAcceptedAt: { type: Date, default: null },
    passwordHash: { type: String, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'other' },

    // Donor details. Anyone can post requests; only donors receive alerts.
    isDonor: { type: Boolean, default: false },
    bloodGroup: { type: String, enum: BLOOD_GROUPS },
    available: { type: Boolean, default: true },
    location: { type: pointSchema, default: undefined },
    lastDonationDate: { type: Date, default: null },

    // Browser push subscription (Web Push API)
    pushSubscription: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

userSchema.index({ location: '2dsphere' });
userSchema.index({ isDonor: 1, available: 1, bloodGroup: 1 });

// Never send secrets to the client.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.pushSubscription;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('User', userSchema);
