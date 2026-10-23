# BloodLink

Find nearby blood donors in minutes. A family posts a request, and every compatible, eligible donor within range gets an instant alert. Donors accept in one tap, and only then are phone numbers shared.

Built entirely in JavaScript: React, Node.js, Express, MongoDB, Socket.io and the Web Push API.

## Features (MVP)

- **Accounts** with phone number and password (JWT login)
- **Donor profile:** blood group, location on a map, availability on/off
- **Post a request:** blood group, units, hospital location, urgency, needed-by time, alert radius
- **Smart matching:**
  - blood group *compatibility*, not just exact match (a B+ patient alerts O−, O+, B− and B+ donors)
  - only donors **within the radius**, using MongoDB's geospatial `$near` query
  - only donors **eligible** to donate (90 days since the last donation for men, 120 for women)
  - only donors who are **available**
- **Instant alerts:** live in the app with Socket.io, and as phone notifications through Web Push when the app is closed
- **Privacy:** phone numbers are revealed only after a donor accepts; donor locations are never shown, only distances
- **Live public map** of open requests that updates without refreshing
- **Close the loop:** the requester marks who donated, which records the donation and pauses that donor until they're eligible again
- **No stale emergencies:** requests nobody closed expire automatically 12 hours after their needed-by time
- **Your data, your call:** anyone can delete their account and everything tied to it from the dashboard; the privacy policy and terms are at `/privacy` and `/terms`
- **Installable PWA** with a service worker

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend | React 18, Vite, Tailwind CSS, React Router |
| Maps | Leaflet with OpenStreetMap tiles |
| Backend | Node.js, Express |
| Database | MongoDB with Mongoose and 2dsphere geo indexes |
| Real-time | Socket.io |
| Notifications | Web Push API (`web-push`) and a service worker |
| Auth | bcrypt password hashing, JSON Web Tokens |

## Run it locally

You need **Node.js 18 or newer** and **MongoDB** (install it locally, or create a free cluster on MongoDB Atlas).

```bash
# 1. Install everything
npm run install:all

# 2. Configure the server
cp server/.env.example server/.env
#    then open server/.env and set MONGO_URI and JWT_SECRET

# 3. (Optional) Add mock data. Pick one:
#    a) Eight demo donors near a point you choose (set SEED_LAT and SEED_LNG in server/.env first)
npm run seed
#    b) A full mock database across ten Indian cities (replaces all existing data)
npm run seed:india

# 4. Start the server (port 5000) and the React app (port 5173) together
npm run dev
```

Open http://localhost:5173.

### Turn on phone notifications (optional)

Live alerts work without this while the app is open. For notifications when the app is closed:

```bash
cd server && npm run vapid
```

Copy the two keys into `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in `server/.env`, restart the server, then click **Turn on phone notifications** on the dashboard.

### Test on your phone

`npm run dev` also serves the app on your local network. Open the "Network" address Vite prints (like `http://192.168.1.5:5173`) on a phone connected to the same Wi-Fi. Browsers only allow location and notifications on `https` or `localhost`, so for full testing on a phone, deploy it (below) or use a tunnel such as ngrok.

To use location on the phone, run `npm run dev:phone` instead. It serves the same app over `https` with a self-signed certificate, so open the `https://` Network address and accept the browser's certificate warning once. Live alerts and location work this way. Push notifications when the app is closed don't, because service workers refuse self-signed certificates.

## Mock data for India

`npm run seed:india` replaces everything in the database with a realistic, repeatable dataset (the same data on every run):

- **About 300 donors in ten cities:** Delhi, Mumbai, Bengaluru, Chennai, Kolkata, Hyderabad, Pune, Jaipur, Lucknow and Ahmedabad, with regional names.
- **Blood groups follow India's population mix**, so O+ and B+ are the most common and negative groups are rare.
- **Real hospitals** (37 of them) at approximate coordinates.
- **Varied donors:** some have never donated, some donated recently and are paused, and some have turned alerts off.
- **Four requester accounts per city** that post the requests.
- **Requests:** open requests with live donor responses, plus a history of fulfilled and cancelled requests whose donations pause the donors who gave.

Every account uses the password `password123`. Phone numbers:

| Phones | Who |
| --- | --- |
| 9000000001 to 9000000008 | The eight demo donors below, in Delhi |
| From 9000001000 | Donors in every city |
| From 9000002000 | Requesters, four per city in the order listed above (9000002000 to 9000002003 are in Delhi) |

The demo walkthrough below still works, but with the extra Delhi donors a B+ request alerts more than four people.

## Demo script

After `npm run seed`, eight demo donors exist around your chosen point (phones `9000000001` to `9000000008`, password `password123`):

| Phone | Donor | Group | Distance | Should a B+ request at the centre alert them? |
| --- | --- | --- | --- | --- |
| 9000000001 | Aarav | O− | ~1 km | Yes, O− gives to everyone |
| 9000000002 | Priya | O+ | ~2.5 km | Yes |
| 9000000003 | Rohan | B+ | ~3.6 km | Yes |
| 9000000004 | Sneha | B− | ~4 km | Yes, donated 200 days ago so she's eligible |
| 9000000005 | Kabir | A+ | ~2 km | No, A+ can't give to B+ |
| 9000000006 | Ananya | AB+ | ~7 km | No, AB+ only gives to AB+ |
| 9000000007 | Vikram | B+ | ~1.7 km | No, donated 30 days ago |
| 9000000008 | Meera | O+ | ~25 km | No, outside the 10 km radius |

1. In one browser window, log in as Rohan (`9000000003`) and open the dashboard.
2. In a private window, register a new account and post a **B+** request with the hospital pinned at the seed centre and a 10 km radius.
3. Rohan's dashboard shows the alert instantly. The success message says **4 donors were alerted**.
4. Rohan clicks **I can donate**. The requester's page updates live with Rohan's name and number.
5. The requester ticks **Donated** and clicks **Mark as fulfilled**. Rohan's dashboard now says when he can donate again.

## API

| Method | Route | Who | What it does |
| --- | --- | --- | --- |
| POST | `/api/auth/register/code` | Anyone | Send a code to confirm a new phone number before signing up |
| POST | `/api/auth/register` | Anyone | Create an account with that code (donors include blood group and location) |
| POST | `/api/auth/login` | Anyone | Log in, returns a token |
| GET | `/api/auth/otp` | Anyone | Whether logging in with a one-time code is available |
| POST | `/api/auth/otp/request` | Anyone | Send a 6-digit login code to a registered phone |
| POST | `/api/auth/otp/verify` | Anyone | Log in with the code, returns a token |
| GET | `/api/me` | User | Profile and donation eligibility |
| PATCH | `/api/me` | User | Availability, location, blood group, become a donor |
| DELETE | `/api/me` | User | Delete the account and everything tied to it (confirm with `password`) |
| GET | `/api/me/alerts` | Donor | Open requests this donor can help with, with distance |
| GET | `/api/me/requests` | User | Requests I posted |
| GET | `/api/me/history` | Donor | My responses and donations |
| GET | `/api/requests/open` | Anyone | Open requests for the public map (no personal details) |
| POST | `/api/requests` | User | Post a request and alert matching donors |
| GET | `/api/requests/:id` | User | Request details; contents depend on who is asking |
| POST | `/api/requests/:id/respond` | Donor | Accept or decline |
| PATCH | `/api/requests/:id/status` | Requester | Mark fulfilled (with who donated) or cancelled |
| GET | `/api/push/public-key` | Anyone | Key for subscribing to push |
| POST | `/api/push/subscribe` | User | Save this browser's push subscription |

### One-time codes: confirming numbers and logging in

**Sign-up confirms the phone number.** After filling in the form, the person gets a code and must enter it before the account is created. The account is then marked `phoneVerified: true`. Logging in with a code also marks an older account as verified. Sign-up and login codes can't be swapped for each other. If no codes can be sent at all (no SMS provider and test mode off), sign-up still works, but accounts stay `phoneVerified: false`.

Codes are 6 digits, work once, and expire after 5 minutes. Only a hash is stored. Five wrong tries cancel a code, and a phone can ask for a new code every 30 seconds, up to 5 an hour.

**Texting codes with MSG91.** Codes are sent as SMS through [MSG91](https://msg91.com):

1. Register on India's DLT portal (your organisation, a sender ID and an OTP message template). MSG91's support can guide you. Approval usually takes days to a couple of weeks.
2. In the MSG91 dashboard, create the OTP template with your DLT template ID, and copy your auth key and the template ID.
3. Put them in `server/.env` as `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID`, then restart the server.

That's all: the login page shows "One-time code", sign-up asks for the code, and codes arrive by text. The app still creates and checks the codes itself; MSG91 only delivers them. If a text fails to send, the person sees a clear message and can try again straight away.

Without MSG91 keys, codes are off: the "One-time code" option is hidden and sign-up skips confirmation. For local testing without texts, set `OTP_DEV_SHOW_CODE=true` in `server/.env`: codes are printed in the server log and shown on screen. **Never set it on a live site**, because anyone could then log in as anyone. Once MSG91 is configured, this setting is ignored.

### Socket.io events

| Event | Sent to | When |
| --- | --- | --- |
| `alert:new` | Each matched donor | A request they can help with is posted |
| `alert:closed` | Alerted donors | That request is fulfilled or cancelled |
| `response:updated` | The requester | A donor accepts or declines |
| `donation:recorded` | The donor | The requester confirms they donated |
| `request:opened` / `request:updated` / `request:closed` | Everyone | Keeps the public map live |

## How matching works

`server/src/utils/compatibility.js` holds the blood compatibility table and eligibility rules. `server/src/services/matching.js` runs one MongoDB query:

```js
User.find({
  isDonor: true,
  available: true,
  bloodGroup: { $in: compatibleDonorGroups(request.bloodGroup) },
  location: { $near: { $geometry: request.location, $maxDistance: radiusKm * 1000 } },
});
```

The `2dsphere` index makes this fast and returns the nearest donors first. Eligibility is then checked against each donor's last donation date and gender.

Run the matching tests with `npm test`.

## Project structure

```
bloodlink/
├── server/
│   ├── src/
│   │   ├── index.js               Express app, MongoDB connection, error handling
│   │   ├── models/                User, BloodRequest, DonorResponse
│   │   ├── routes/                auth, me, requests, push
│   │   ├── services/matching.js   Finding donors for a request, and requests for a donor
│   │   ├── services/notify.js     Socket.io and Web Push
│   │   ├── middleware/auth.js     JWT check
│   │   └── utils/                 Compatibility rules, helpers
│   ├── scripts/seed.js            Demo donors
│   └── tests/                     Matching unit tests
└── client/
    ├── public/sw.js               Service worker for push notifications
    └── src/
        ├── pages/                 Home, Login, Register, Dashboard, NewRequest, RequestDetail
        ├── components/            BloodDrop, maps, pickers, navbar
        ├── context/               Auth and toast state
        └── lib/                   API client, socket, push helpers
```

## Deploy

**[DEPLOY.md](DEPLOY.md) walks through it step by step.** In short: one Render web service serves both the API and the built React app, with a MongoDB Atlas database. `render.yaml` sets the service up (Render → New → Blueprint), so you only paste in your Atlas connection string. The server serves `client/dist` when it exists, so the whole app runs at one `https` URL, which phones need for location and notifications.

To try the production setup locally: `npm run build`, then `npm start` (the app is at http://localhost:5000).

### Before going live

- **Don't copy your local `server/.env`.** Set each value on the host instead. In particular, never set `OTP_DEV_SHOW_CODE=true` (anyone could log in as anyone) or `RATE_LIMIT=off` on a live site.
- **Behind a proxy**, rate limits need to see each visitor's real address. This is detected automatically on Render. On other hosts, set `TRUST_PROXY=1` (or the number of proxies).
- **Never seed the live database.** `npm run seed` and `npm run seed:india` refuse to run unless `MONGO_URI` points at this machine.
- **Turn on backups** in MongoDB Atlas.
- **Finish the legal pages.** `client/src/pages/Legal.jsx` has draft privacy and terms pages written to match what the app does. Fill in the `[bracketed]` placeholders (organisation, contact email, city, date) and have a qualified lawyer review them.

### Built-in protection

- **Security headers** (via helmet): a content security policy that only allows this site's own code, Google Fonts and OpenStreetMap tiles; no embedding in other sites; no `X-Powered-By`.
- **Rate limits**, kept in memory, so counts reset if the server restarts:

| What | Limit |
| --- | --- |
| All API requests | 300 a minute per address |
| Wrong passwords | 10 per phone number and 20 per address, every 15 minutes (successful logins don't count) |
| Sign-ups | 30 an hour per address |
| One-time codes | 30 per address every 15 minutes, plus 1 every 30 seconds and 5 an hour per phone |
| Posting blood requests | 5 an hour per account |
| Accepting or declining | 60 an hour per account |

## Version 2 ideas

- Phone OTP verification to stop fake requests
- SMS or WhatsApp alerts for donors without notifications enabled
- Verified hospital and blood bank accounts
- Donor badges and donation certificates
- Hindi interface
- Admin panel for reported requests

## Medical note

The compatibility table covers red blood cell donations, and the donation gaps follow commonly used guidance in India. Check current national guidelines before relying on them, and always let the blood bank make the final medical decision.
