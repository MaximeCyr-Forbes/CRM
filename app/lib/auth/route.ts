import { getAuthenticatedMember, googleLoginEnabled } from './server';
import { crmMemberContext } from './context';
import { withSupabaseClient } from '../supabase/request-context';

/** Each HTTP handler enters its own scope: never use AsyncLocalStorage.enterWith. */
export function withCRMIdentity<A extends unknown[], R extends Response>(handler: (...args: A) => Promise<R>) {
  return async (...args: A): Promise<R | Response> => {
    if (!googleLoginEnabled()) return handler(...args);
    try {
      const auth = await getAuthenticatedMember();
      if (auth) return crmMemberContext.run(auth.member, () => withSupabaseClient(auth.client, () => handler(...args)));
      // A rejected individual identity must not silently fall through to a shared cookie.
      const { cookies } = await import('next/headers');
  const store = await cookies();
      if (store.getAll().some(({ name }) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name))) {
        return Response.json({ error: 'Ce compte Google n’est pas autorisé à accéder au CRM Équipe Forbes.' }, { status: 403 });
      }
      return handler(...args); // Existing handler enforces the temporary legacy gate.
    } catch {
      return Response.json({ error: 'Vérification de votre accès temporairement indisponible.' }, { status: 503 });
    }
  };
}
