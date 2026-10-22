import mongoose from 'mongoose';

// A donor's answer to one blood request.
const donorResponseSchema = new mongoose.Schema(
  {
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'BloodRequest', required: true },
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['accepted', 'declined', 'donated'], required: true },
  },
  { timestamps: true }
);

// One response per donor per request (they can change it, not duplicate it)
donorResponseSchema.index({ request: 1, donor: 1 }, { unique: true });

export default mongoose.model('DonorResponse', donorResponseSchema);
