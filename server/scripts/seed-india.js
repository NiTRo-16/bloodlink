// Fills the database with realistic mock data across ten Indian cities:
// donors, people who posted requests, open and closed requests, and donor responses.
// Usage: npm run seed:india   (this REPLACES all users, requests and responses)
//
// The data is generated from a fixed random seed, so every run produces the same people.
// Hospital names are real; their coordinates are approximate. Every phone number starts
// with 90000, so none of them belong to a real person.
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import { refuseRemoteDatabase } from './guard.js';
import BloodRequest from '../src/models/BloodRequest.js';
import DonorResponse from '../src/models/DonorResponse.js';
import { compatibleDonorGroups, isEligible } from '../src/utils/compatibility.js';
import { findMatchingDonors } from '../src/services/matching.js';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = Date.now();

// ---------- Deterministic randomness ----------

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(2026);
const between = (min, max) => min + rand() * (max - min);
const int = (min, max) => Math.floor(between(min, max + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
function weighted(table) {
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [key, w] of Object.entries(table)) if ((r -= w) <= 0) return key;
  return Object.keys(table)[0];
}

// ---------- Reference data ----------

// Approximate share of each blood group in India. Negative groups are rare (about 5% together).
const BLOOD_GROUP_SHARE = { 'O+': 36, 'B+': 32, 'A+': 22, 'AB+': 7, 'O-': 1.2, 'B-': 1, 'A-': 0.6, 'AB-': 0.2 };

const NAMES = {
  north: {
    male: ['Aarav', 'Rohit', 'Amit', 'Rahul', 'Karan', 'Vikas', 'Manish', 'Deepak', 'Gurpreet', 'Ankit', 'Saurabh', 'Abhishek', 'Nitin', 'Varun'],
    female: ['Neha', 'Pooja', 'Priya', 'Anjali', 'Simran', 'Sunita', 'Kavita', 'Ritu', 'Shalini', 'Swati', 'Nidhi', 'Harpreet', 'Megha', 'Aditi'],
    surnames: ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Yadav', 'Chauhan', 'Malhotra', 'Kapoor', 'Agarwal', 'Mishra', 'Tiwari', 'Pandey', 'Srivastava', 'Saxena', 'Bansal'],
  },
  west: {
    male: ['Omkar', 'Sagar', 'Siddharth', 'Tejas', 'Nikhil', 'Hardik', 'Dhruv', 'Parth', 'Prathamesh', 'Chirag', 'Yash', 'Mihir', 'Rohan', 'Kunal'],
    female: ['Rutuja', 'Sneha', 'Pranali', 'Jinal', 'Krupa', 'Hetal', 'Shraddha', 'Ketaki', 'Mansi', 'Riddhi', 'Bhakti', 'Dhara', 'Asmita', 'Payal'],
    surnames: ['Patil', 'Deshmukh', 'Kulkarni', 'Joshi', 'Shinde', 'Pawar', 'Jadhav', 'Patel', 'Shah', 'Mehta', 'Desai', 'Trivedi', 'Gaikwad', 'Bhatt', 'More'],
  },
  south: {
    male: ['Arjun', 'Karthik', 'Vignesh', 'Suresh', 'Ramesh', 'Harish', 'Naveen', 'Srinivas', 'Pradeep', 'Sai', 'Manoj', 'Rakesh', 'Arun', 'Ganesh'],
    female: ['Lakshmi', 'Divya', 'Meenakshi', 'Kavya', 'Anitha', 'Deepa', 'Shruthi', 'Swathi', 'Revathi', 'Sowmya', 'Pavithra', 'Keerthana', 'Bhavana', 'Nandini'],
    surnames: ['Iyer', 'Iyengar', 'Reddy', 'Rao', 'Nair', 'Menon', 'Pillai', 'Naidu', 'Krishnan', 'Subramanian', 'Gowda', 'Hegde', 'Shetty', 'Murthy', 'Raghavan'],
  },
  east: {
    male: ['Arindam', 'Sourav', 'Debashis', 'Subhajit', 'Tanmoy', 'Sayan', 'Abhijit', 'Rajib', 'Partha', 'Suman', 'Anirban', 'Kaushik'],
    female: ['Ananya', 'Riya', 'Moumita', 'Priyanka', 'Rupa', 'Sreya', 'Debolina', 'Tanushree', 'Sudeshna', 'Paromita', 'Arpita', 'Madhumita'],
    surnames: ['Banerjee', 'Chatterjee', 'Mukherjee', 'Das', 'Ghosh', 'Bose', 'Sen', 'Dutta', 'Roy', 'Chakraborty', 'Saha', 'Majumdar'],
  },
};

// [name, lat, lng] — real hospitals, approximate coordinates
const CITIES = [
  {
    city: 'Delhi', region: 'north', centre: [28.6139, 77.209], donors: 45,
    hospitals: [
      ['AIIMS, Ansari Nagar', 28.5672, 77.21], ['Safdarjung Hospital', 28.5681, 77.2063],
      ['Sir Ganga Ram Hospital', 28.638, 77.189], ['Ram Manohar Lohia Hospital', 28.626, 77.2006],
      ['Lok Nayak Hospital', 28.6389, 77.2381], ['Max Super Speciality Hospital, Saket', 28.5276, 77.2117],
      ['Fortis Hospital, Vasant Kunj', 28.5203, 77.158],
    ],
  },
  {
    city: 'Mumbai', region: 'west', centre: [19.076, 72.8777], donors: 40,
    hospitals: [
      ['KEM Hospital, Parel', 19.0026, 72.8414], ['Tata Memorial Hospital, Parel', 19.0045, 72.8436],
      ['Lilavati Hospital, Bandra', 19.051, 72.829], ['Kokilaben Dhirubhai Ambani Hospital, Andheri', 19.1312, 72.8257],
      ['Sir JJ Hospital, Byculla', 18.963, 72.833], ['LTMG Sion Hospital', 19.035, 72.859],
    ],
  },
  {
    city: 'Bengaluru', region: 'south', centre: [12.9716, 77.5946], donors: 35,
    hospitals: [
      ['Victoria Hospital', 12.9634, 77.5736], ['NIMHANS', 12.9431, 77.5966],
      ['Manipal Hospital, Old Airport Road', 12.9592, 77.6489], ["St. John's Medical College Hospital", 12.93, 77.619],
      ['Narayana Health City, Bommasandra', 12.81, 77.695],
    ],
  },
  {
    city: 'Chennai', region: 'south', centre: [13.0827, 80.2707], donors: 30,
    hospitals: [
      ['Rajiv Gandhi Government General Hospital', 13.082, 80.277], ['Apollo Hospitals, Greams Road', 13.063, 80.251],
      ['Stanley Medical College Hospital', 13.106, 80.287], ['MIOT International, Manapakkam', 13.018, 80.187],
    ],
  },
  {
    city: 'Kolkata', region: 'east', centre: [22.5726, 88.3639], donors: 30,
    hospitals: [
      ['SSKM Hospital', 22.539, 88.343], ['Medical College and Hospital, Kolkata', 22.574, 88.362],
      ['AMRI Hospital, Dhakuria', 22.511, 88.369], ['Tata Medical Center, New Town', 22.582, 88.48],
    ],
  },
  {
    city: 'Hyderabad', region: 'south', centre: [17.385, 78.4867], donors: 30,
    hospitals: [
      ['Osmania General Hospital', 17.373, 78.476], ['Gandhi Hospital, Secunderabad', 17.423, 78.503],
      ['NIMS, Punjagutta', 17.42, 78.452], ['Apollo Hospitals, Jubilee Hills', 17.416, 78.41],
    ],
  },
  {
    city: 'Pune', region: 'west', centre: [18.5204, 73.8567], donors: 25,
    hospitals: [
      ['Sassoon General Hospital', 18.528, 73.871], ['Ruby Hall Clinic', 18.532, 73.877],
      ['KEM Hospital, Rasta Peth', 18.518, 73.865], ['Jehangir Hospital', 18.53, 73.876],
    ],
  },
  {
    city: 'Jaipur', region: 'north', centre: [26.9124, 75.7873], donors: 20,
    hospitals: [
      ['SMS Hospital', 26.905, 75.815], ['Fortis Escorts Hospital, Malviya Nagar', 26.854, 75.805],
      ['Mahatma Gandhi Hospital, Sitapura', 26.779, 75.846],
    ],
  },
  {
    city: 'Lucknow', region: 'north', centre: [26.8467, 80.9462], donors: 20,
    hospitals: [
      ["King George's Medical University", 26.869, 80.916], ['SGPGI, Raebareli Road', 26.745, 80.937],
      ['Dr. Ram Manohar Lohia Institute', 26.853, 80.989],
    ],
  },
  {
    city: 'Ahmedabad', region: 'west', centre: [23.0225, 72.5714], donors: 20,
    hospitals: [
      ['Civil Hospital, Asarwa', 23.053, 72.603], ['Zydus Hospital, Thaltej', 23.059, 72.515],
      ['Sterling Hospital, Gurukul', 23.045, 72.53],
    ],
  },
];

// Why the blood is needed. These are whole-blood / red cell needs, which is what the app matches.
const NOTES = [
  'Road accident, patient is in the ICU.',
  'Thalassemia major, needs a transfusion every three weeks.',
  'Scheduled bypass surgery on the date above.',
  'Post-delivery bleeding, mother is stable now.',
  'Chemotherapy patient with low haemoglobin.',
  'Hip replacement surgery, two units to be kept ready.',
  'Kidney transplant planned, please donate at the hospital blood bank.',
  'Severe anaemia, doctor has asked for fresh blood.',
  'Caesarean delivery, blood to be kept on standby.',
  'Burns patient, multiple transfusions expected.',
  'Ask for the blood bank counter on the ground floor.',
  '',
  '',
];

// ---------- Helpers ----------

let nextPhone = { donor: 9000001000, requester: 9000002000 };
const phoneFor = (kind) => String(nextPhone[kind]++);

/** A point roughly `maxKm` around a centre, denser near the middle. */
function scatter([lat, lng], maxKm) {
  const km = maxKm * Math.sqrt(rand()) * 0.9;
  const angle = rand() * 2 * Math.PI;
  const dLat = (km * Math.cos(angle)) / 111;
  const dLng = (km * Math.sin(angle)) / (111 * Math.cos((lat * Math.PI) / 180));
  return { type: 'Point', coordinates: [+(lng + dLng).toFixed(5), +(lat + dLat).toFixed(5)] };
}

function person(region) {
  const gender = chance(0.55) ? 'male' : 'female';
  const n = NAMES[region];
  return { name: `${pick(n[gender])} ${pick(n.surnames)}`, gender };
}

const roundToHalfHour = (ms) => Math.round(ms / (30 * 60 * 1000)) * 30 * 60 * 1000;

// ---------- Build ----------

refuseRemoteDatabase(process.env.MONGO_URI, 'npm run seed:india');
await mongoose.connect(process.env.MONGO_URI);
await Promise.all([User.syncIndexes(), BloodRequest.syncIndexes(), DonorResponse.syncIndexes()]);

console.log(`Replacing all data in ${mongoose.connection.name}…`);
await Promise.all([User.deleteMany({}), BloodRequest.deleteMany({}), DonorResponse.deleteMany({})]);

const passwordHash = await bcrypt.hash('password123', 10);
const stamp = (date) => ({ createdAt: new Date(date), updatedAt: new Date(date) });

// 1. The original eight demo donors, so the README walkthrough still works in Delhi.
const DEMO = [
  ['Aarav Sharma', 'male', 'O-', 1.0, 0.5, null],
  ['Priya Verma', 'female', 'O+', -2.0, 1.5, null],
  ['Rohan Gupta', 'male', 'B+', 3.0, -2.0, null],
  ['Sneha Iyer', 'female', 'B-', 0.5, 4.0, 200],
  ['Kabir Singh', 'male', 'A+', -1.5, -1.0, null],
  ['Ananya Rao', 'female', 'AB+', 5.0, 5.0, null],
  ['Vikram Patel', 'male', 'B+', 1.2, 1.2, 30],
  ['Meera Joshi', 'female', 'O+', 25.0, 0, null],
];
const [dLat, dLng] = CITIES[0].centre;
const users = DEMO.map(([name, gender, bloodGroup, north, east, daysAgo], i) => ({
  name, gender, bloodGroup, passwordHash,
  phone: `90000000${String(i + 1).padStart(2, '0')}`,
  isDonor: true,
  phoneVerified: true, // seeded accounts count as existing, confirmed users
  available: true,
  location: { type: 'Point', coordinates: [dLng + east / (111 * Math.cos((dLat * Math.PI) / 180)), dLat + north / 111] },
  lastDonationDate: daysAgo ? new Date(NOW - daysAgo * DAY) : null,
  ...stamp(NOW - int(200, 400) * DAY),
}));

// 2. Donors and requesters in every city.
for (const c of CITIES) {
  for (let i = 0; i < c.donors; i++) {
    const p = person(c.region);
    // 45% have never donated; the rest gave somewhere between 10 days and about 14 months ago.
    const lastDonationDate = chance(0.45) ? null : new Date(NOW - int(10, 420) * DAY);
    users.push({
      ...p, passwordHash,
      phone: phoneFor('donor'),
      isDonor: true,
      phoneVerified: true,
      bloodGroup: weighted(BLOOD_GROUP_SHARE),
      available: chance(0.85),
      location: scatter(c.centre, 14),
      lastDonationDate,
      ...stamp(NOW - int(30, 500) * DAY),
      city: c.city,
    });
  }
  // Family members who signed up only to post requests (no blood group, not donors).
  for (let i = 0; i < 4; i++) {
    users.push({
      ...person(c.region), passwordHash,
      phone: phoneFor('requester'),
      isDonor: false,
      phoneVerified: true,
      location: scatter(c.centre, 10),
      ...stamp(NOW - int(5, 200) * DAY),
      city: c.city,
    });
  }
}

const cityOf = new Map();
const created = await User.create(
  users.map(({ city, ...u }) => u),
  { timestamps: false }
);
created.forEach((u, i) => cityOf.set(String(u._id), users[i].city ?? 'Delhi'));
// The README walkthrough depends on the demo donors' eligibility, so past requests never involve them.
const demoIds = new Set(created.slice(0, DEMO.length).map((u) => String(u._id)));
const requestersIn = (city) => created.filter((u) => !u.isDonor && cityOf.get(String(u._id)) === city);

// 3. Requests. Closed ones go first, oldest first, so donations they record pause donors
//    for the requests that come after them, just as in real use.
const plans = [];
for (const c of CITIES) {
  const closedCount = Math.round(c.donors / 6);
  const openCount = Math.max(2, Math.round(c.donors / 12));
  for (let i = 0; i < closedCount; i++) plans.push({ c, open: false, at: NOW - int(4, 150) * DAY - int(0, 23) * HOUR });
  for (let i = 0; i < openCount; i++) plans.push({ c, open: true, at: NOW - int(5, 60 * 30) * 60 * 1000 });
}
plans.sort((a, b) => a.at - b.at);

// Requested blood groups follow the population, with the rare groups a little more common
// (rare-group patients are the ones who most need an app like this).
const REQUEST_GROUP_SHARE = { ...BLOOD_GROUP_SHARE, 'O-': 4, 'B-': 3, 'A-': 2, 'AB-': 1 };

let stats = { open: 0, fulfilled: 0, cancelled: 0, responses: 0, donations: 0 };

for (const { c, open, at } of plans) {
  const requester = pick(requestersIn(c.city));
  const [hospital, hLat, hLng] = pick(c.hospitals);
  const urgency = weighted({ critical: 2, urgent: 5, normal: 3 });
  const leadHours = urgency === 'critical' ? int(2, 8) : urgency === 'urgent' ? int(6, 24) : int(24, 96);
  let neededBy = roundToHalfHour(at + leadHours * HOUR);
  if (open && neededBy < NOW + 2 * HOUR) neededBy = roundToHalfHour(NOW + int(2, 30) * HOUR); // keep open requests in the future

  const request = new BloodRequest({
    requester: requester._id,
    patientName: person(c.region).name,
    bloodGroup: weighted(REQUEST_GROUP_SHARE),
    units: weighted({ 1: 5, 2: 4, 3: 2, 4: 1 }) * 1,
    hospital,
    notes: pick(NOTES),
    contactPhone: requester.phone,
    location: { type: 'Point', coordinates: [hLng, hLat] },
    urgency,
    neededBy: new Date(neededBy),
    radiusKm: weighted({ 5: 1, 10: 5, 20: 3, 50: 1 }) * 1,
    ...stamp(at),
  });

  // Who would have been alerted at the time the request was posted.
  let donors;
  if (open) {
    donors = await findMatchingDonors(request);
  } else {
    const candidates = await User.find({
      isDonor: true,
      bloodGroup: { $in: compatibleDonorGroups(request.bloodGroup) },
      _id: { $ne: request.requester },
      location: { $near: { $geometry: request.location.toObject(), $maxDistance: request.radiusKm * 1000 } },
    }).limit(200);
    const when = new Date(at);
    donors = candidates.filter(
      (d) =>
        !demoIds.has(String(d._id)) &&
        d.available &&
        (!d.lastDonationDate || d.lastDonationDate <= when) &&
        isEligible(d, when)
    );
  }
  request.notifiedDonors = donors.map((d) => d._id);

  // Some of the alerted donors answer: most say yes, some can't make it.
  const responders = donors.filter((d) => !demoIds.has(String(d._id)) && chance(open ? 0.35 : 0.5));
  const responses = responders.map((d) => ({
    request: request._id,
    donor: d._id,
    status: chance(0.72) ? 'accepted' : 'declined',
    ...stamp(at + int(4, 180) * 60 * 1000),
  }));

  if (open) {
    stats.open++;
  } else {
    const accepted = responses.filter((r) => r.status === 'accepted');
    request.status = accepted.length && chance(0.85) ? 'fulfilled' : 'cancelled';
    const closedAt = new Date(Math.min(neededBy + int(1, 12) * HOUR, NOW - HOUR));
    request.closedAt = closedAt;
    request.updatedAt = closedAt;
    stats[request.status]++;

    if (request.status === 'fulfilled') {
      // Up to `units` of the donors who said yes actually donated.
      for (const r of accepted.slice(0, request.units)) {
        r.status = 'donated';
        r.updatedAt = closedAt;
        await User.updateOne({ _id: r.donor }, { lastDonationDate: closedAt }, { timestamps: false });
        stats.donations++;
      }
    }
  }

  await request.save({ timestamps: false });
  if (responses.length) await DonorResponse.insertMany(responses, { timestamps: false });
  stats.responses += responses.length;
}

// ---------- Summary ----------

const rows = [];
for (const c of CITIES) {
  const ids = created.filter((u) => cityOf.get(String(u._id)) === c.city).map((u) => u._id);
  const reqs = await BloodRequest.find({ requester: { $in: ids } }, 'status').lean();
  rows.push({
    city: c.city,
    donors: await User.countDocuments({ _id: { $in: ids }, isDonor: true }),
    requesters: await User.countDocuments({ _id: { $in: ids }, isDonor: false }),
    open: reqs.filter((r) => r.status === 'open').length,
    closed: reqs.filter((r) => r.status !== 'open').length,
  });
}
console.table(rows);
console.log(
  `${created.length} users, ${plans.length} requests (${stats.open} open, ${stats.fulfilled} fulfilled, ` +
    `${stats.cancelled} cancelled), ${stats.responses} donor responses, ${stats.donations} donations recorded.`
);
console.log('\nEvery account uses the password: password123');
console.log('  Demo donors in Delhi: 9000000001 to 9000000008 (see the README walkthrough)');
console.log(`  Other donors:         9000001000 to ${nextPhone.donor - 1}`);
console.log(`  Requesters:           9000002000 to ${nextPhone.requester - 1} (four per city, in the order listed above)`);

await mongoose.disconnect();
