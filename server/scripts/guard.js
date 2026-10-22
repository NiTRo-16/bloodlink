// Seed scripts write fake people (and seed:india deletes everything first), so they only run
// against a database on this machine unless you explicitly say otherwise.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** True when every host in a mongodb:// URI is this machine. mongodb+srv:// is always remote (Atlas). */
export function isLocalMongoUri(uri) {
  const match = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/.exec(String(uri ?? ''));
  if (!match) return false;
  return match[1].split(',').every((host) => LOCAL_HOSTS.has(host.replace(/:\d+$/, '').toLowerCase()));
}

export function refuseRemoteDatabase(uri, scriptName) {
  if (isLocalMongoUri(uri) || process.env.SEED_ALLOW_REMOTE === 'yes') return;
  console.error(
    `${scriptName} only runs against a local database, and MONGO_URI points somewhere else.\n` +
      'It writes fake demo people (and seed:india deletes all existing data first).\n' +
      'If you really mean to seed that database, run it again with SEED_ALLOW_REMOTE=yes.'
  );
  process.exit(1);
}
