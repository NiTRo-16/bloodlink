import mongoose from 'mongoose';

// The current login code for a phone number, plus the counters that rate-limit sending.
// One document per phone; MongoDB deletes it once both the code and the hourly window are over.
const otpCodeSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ['login', 'signup'], default: 'login' }, // what the current code may be used for
  codeHash: { type: String, default: null }, // null once used or cancelled
  expiresAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
  windowStart: { type: Date, required: true },
  sends: { type: Number, default: 0 },
  purgeAt: { type: Date, required: true },
});

otpCodeSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('OtpCode', otpCodeSchema);
