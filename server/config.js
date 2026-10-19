export function loadConfig(options = {}) {
  return {
    databasePath: process.env.DATABASE_PATH || './data/capyhome.sqlite',
    adminName: process.env.ADMIN_NAME,
    adminUsername: process.env.ADMIN_USERNAME,
    adminPassword: process.env.ADMIN_PASSWORD,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    trustProxy: process.env.TRUST_PROXY === '1',
    timeZone: process.env.TZ || 'Europe/Rome',
    ...options
  };
}
