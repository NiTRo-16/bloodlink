// Creates demo donors around a centre point so you can test matching.
// Usage: npm run seed   (set SEED_LAT / SEED_LNG in .env to your city)
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import { refuseRemoteDatabase } from './guard.js';

const lat = Number(process.env.SEED_LAT ?? 28.6139);
const lng = Number(process.env.SEED_LNG ?? 77.209);
const DAY = 24 * 60 * 60 * 1000;

// [name, gender, blood group, km north, km east, days since last donation or null]
const donors = [
  ['Aarav Sharma', 'male', 'O-', 1.0, 0.5, null],
  ['Priya Verma', 'female', 'O+', -2.0, 1.5, null],
  ['Rohan Gupta', 'male', 'B+', 3.0, -2.0, null],
  ['Sneha Iyer', 'female', 'B-', 0.5, 4.0, 200],
  ['Kabir Singh', 'male', 'A+', -1.5, -1.0, null],
  ['Ananya Rao', 'female', 'AB+', 5.0, 5.0, null],
  ['Vikram Patel', 'male', 'B+', 1.2, 1.2, 30], // donated recently: should NOT be alerted
  ['Meera Joshi', 'female', 'O+', 25.0, 0, null], // too far away for a 10 km request
];

const kmToLat = (km) => km / 111;
const kmToLng = (km) => km / (111 * Math.cos((lat * Math.PI) / 180));

refuseRemoteDatabase(process.env.MONGO_URI, 'npm run seed');
await mongoose.connect(process.env.MONGO_URI);
await User.syncIndexes();

const passwordHash = await bcrypt.hash('password123', 10);
const rows = [];

for (const [i, [name, gender, bloodGroup, north, east, daysAgo]] of donors.entries()) {
  const phone = `90000000${String(i + 1).padStart(2, '0')}`;
  await User.findOneAndUpdate(
    { phone },
    {
      name,
      phone,
      gender,
      passwordHash,
      isDonor: true,
      phoneVerified: true,
      available: true,
      bloodGroup,
      location: { type: 'Point', coordinates: [lng + kmToLng(east), lat + kmToLat(north)] },
      lastDonationDate: daysAgo ? new Date(Date.now() - daysAgo * DAY) : null,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  rows.push({ name, phone, bloodGroup, gender, note: daysAgo ? `donated ${daysAgo} days ago` : '' });
}

console.table(rows);
console.log('All demo donors use the password: password123');
await mongoose.disconnect();
