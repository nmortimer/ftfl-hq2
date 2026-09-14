// Deliberately simple: one shared password, set as an env var on Vercel
// (Project Settings -> Environment Variables -> COMMISSIONER_PASSWORD),
// never committed to the repo. Good enough for "only the commissioner can
// edit this," not meant to be a real multi-user auth system.
export function checkCommissionerPassword(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const expected = process.env.COMMISSIONER_PASSWORD;
  if (!expected) {
    // Fail closed: if no password is configured on the server, refuse all
    // writes rather than silently allowing anyone to edit.
    return false;
  }
  const provided = req.headers['x-commissioner-password'];
  return provided === expected;
}
