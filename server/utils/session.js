export const sessionCookie = 'capyhome_session';
export const sessionDuration = 7 * 24 * 60 * 60 * 1000;

export function cookieOptions(secure) {
  return { httpOnly: true, sameSite: 'lax', secure, path: '/' };
}

export function publicUser(row) {
  return { id: row.id, name: row.name, username: row.username, role: row.role, status: row.status };
}

export function readSessionToken(req) {
  const token = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${sessionCookie}=`))?.slice(sessionCookie.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
