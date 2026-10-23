import mongoose from 'mongoose';
import { BLOOD_GROUPS } from '../utils/compatibility.js';
import { pointSchema } from './User.js';

const bloodRequestSchema = new mongoose.Schema(
  {
    requester: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    patientName: { type: String, required: true, trim: true, maxlength: 80 },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, required: true },
    units: { type: Number, required: true, min: 1, max: 20 },
    hospital: { type: String, required: true, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    contactPhone: { type: String, required: true, trim: true },
    location: { type: pointSchema, required: true },
    urgency: { type: String, enum: ['normal', 'urgent', 'critical'], default: 'urgent' },
    neededBy: { type: Date, required: true },
    radiusKm: { type: Number, default: 10, min: 1, max: 100 },

    // 'expired' is set automatically 12 hours after neededBy if nobody closed it (services/expiry.js)
    status: { type: String, enum: ['open', 'fulfilled', 'cancelled', 'expired'], default: 'open' },
    closedAt: { type: Date, default: null },

    // Donors who were alerted when the request was posted
    notifiedDonors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

bloodRequestSchema.index({ location: '2dsphere' });
bloodRequestSchema.index({ status: 1, createdAt: -1 });

bloodRequestSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('BloodRequest', bloodRequestSchema);
