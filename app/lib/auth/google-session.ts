import { cookies } from 'next/headers';
import { createCRMAuthClient } from './server';

/** Clear only the CRM Google session; leave the rescue cookie and Google integrations intact. */
export async function clearGoogleSession() {
  try { await (await createCRMAuthClient()).auth.signOut({ scope: 'local' }); } catch { /* Expired sessions still need local cleanup. */ }
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (/^sb-.*-auth-token(?:\.\d+|-code-verifier)?$/.test(name)) store.set(name, '', { path: '/', maxAge: 0 });
  }
}
