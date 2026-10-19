import { AsyncLocalStorage } from 'node:async_hooks';
import type { CRMMember } from './identity';
/** Actor is immutable for the entire request; viewed broker never enters this store. */
export const crmMemberContext = new AsyncLocalStorage<CRMMember>();
