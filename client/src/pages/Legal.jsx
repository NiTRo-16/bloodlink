import { Link } from 'react-router-dom';

// DRAFT legal pages, written to match what the app actually does.
// Replace the [bracketed] placeholders and have a qualified lawyer review both pages before launch.
const ORG = '[Organisation name]';
const EMAIL = '[contact email]';
const CITY = '[city]';
const UPDATED = '[date]';

function Page({ title, children }) {
  return (
    <article className="mx-auto max-w-2xl">
      <h1 className="text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-slate">Last updated {UPDATED}</p>
      <div className="panel mt-6 space-y-5 leading-relaxed [&_h2]:mt-2 [&_h2]:text-xl [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
    </article>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy policy">
      <p>
        BloodLink, run by {ORG}, connects people who need blood with donors nearby. This page explains what we collect,
        who can see it, and how to delete it. It is written for India's Digital Personal Data Protection Act, 2023.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><b>Your account:</b> name, phone number, and a password (stored only in scrambled, hashed form).</li>
        <li><b>If you donate:</b> blood group, gender (only to work out when you can donate again), the location you choose for alerts, the date of your last donation, and whether you're available.</li>
        <li><b>Requests you post:</b> the patient's name, blood group, units, hospital and its location, urgency, needed-by time, contact number and any notes.</li>
        <li><b>Your answers to requests:</b> whether you accepted, declined or donated.</li>
        <li><b>If you turn on notifications:</b> a code from your browser that lets us send alerts to this device.</li>
      </ul>
      <p>We don't collect medical records, and we don't sell or rent personal data to anyone.</p>

      <h2>Who can see what</h2>
      <ul>
        <li><b>Anyone</b> can see open requests on the map: blood group, units, hospital, urgency and timing. Never names or phone numbers.</li>
        <li><b>Logged-in users</b> can open a request and see the patient's first name and initial, the hospital and the notes. A donor sees the full name once they accept.</li>
        <li><b>Your phone number</b> is shown to a family only after you accept their request, and theirs is shown to you at the same moment.</li>
        <li><b>Your location</b> is never shown to anyone. Others only see how far away you are.</li>
      </ul>

      <h2>Services that handle data for us</h2>
      <ul>
        <li><b>Hosting and database</b> (Render and MongoDB Atlas) store the app and its data.</li>
        <li><b>MSG91</b> receives your phone number and a one-time code to text it to you.</li>
        <li><b>Google Fonts</b> and <b>OpenStreetMap</b> serve fonts and map images, so they see your device's IP address.</li>
        <li><b>Your browser's push service</b> (from Google, Apple or Mozilla) delivers alerts if you turn on notifications.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Your account and its data are kept until you delete them. One-time codes are deleted within an hour. Security
        counters (such as failed logins) are kept only in memory for up to an hour.
      </p>

      <h2>Your rights</h2>
      <p>
        You can see and correct your details in the app, and you can <b>delete your account at any time</b> from your
        dashboard. That removes your profile, donation history, answers and the requests you posted. You can also ask us
        for a summary of your data, correct it, nominate someone to act for you, or raise a complaint. Write to our
        grievance officer at {EMAIL}; we reply within 30 days. If you're not satisfied, you can complain to the Data
        Protection Board of India.
      </p>

      <h2>Security</h2>
      <p>
        The site is served over an encrypted connection. Passwords and login codes are stored only as hashes, and repeated
        wrong guesses are blocked.
      </p>

      <h2>Children</h2>
      <p>You must be 18 or older to create an account.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we'll update the date above and tell you in the app if the change is significant.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of use">
      <p>
        These terms apply when you use BloodLink, run by {ORG}. By creating an account, you agree to them and to our{' '}
        <Link to="/privacy" className="font-extrabold text-blood underline">privacy policy</Link>.
      </p>

      <h2>What BloodLink is, and isn't</h2>
      <ul>
        <li>BloodLink helps families find willing donors nearby. It is not a blood bank, a hospital or a medical service.</li>
        <li>We can't promise that anyone will respond to a request, or respond in time. In an emergency, call <b>108</b> and contact the hospital's blood bank at the same time.</li>
        <li>Blood compatibility and eligibility shown in the app are general guidance. The blood bank always tests donors and blood, and makes the final medical decision.</li>
      </ul>

      <h2>Your responsibilities</h2>
      <ul>
        <li>You're 18 or older, and the details you give (including your blood group and phone number) are true.</li>
        <li>Only post real requests, and close them when they're fulfilled or no longer needed.</li>
        <li><b>Never ask for or offer money for blood.</b> Paid blood donation is not allowed in India; donation through BloodLink is voluntary.</li>
        <li>Use phone numbers you receive only to arrange the donation. Don't share them or use them for anything else.</li>
        <li>Don't misuse the service: no fake accounts, spam, harassment, or attempts to break or overload it.</li>
      </ul>

      <h2>Accounts</h2>
      <p>
        You can delete your account at any time from your dashboard. We may suspend or remove accounts that break these
        terms, especially fake or abusive requests.
      </p>

      <h2>Liability</h2>
      <p>
        BloodLink is provided as it is. As far as the law allows, {ORG} isn't liable for what happens between users,
        for requests that go unanswered, or for medical outcomes. Nothing in these terms limits rights you have under
        Indian consumer law.
      </p>

      <h2>Law and contact</h2>
      <p>
        These terms are governed by the laws of India, and the courts of {CITY} have jurisdiction. Questions? Write to {EMAIL}.
      </p>
    </Page>
  );
}
