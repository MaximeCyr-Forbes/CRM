import { z } from 'zod';
import {conversationState} from './query-plan';

export const MODEL = 'gpt-6-luna';
export const RESERVATION_USD = 0.03;
export const MAX_PAYLOAD_BYTES = 48_000;
export const DISABLED_MESSAGE = 'Assistant Forbes temporairement indisponible. Aucun nouvel appel IA n’a été effectué.';
export const chatInput = z.strictObject({
  requestId: z.uuid(),
  question: z.string().trim().min(1).max(600),
  history: z.array(z.strictObject({ question: z.string().max(600), answer: z.string().max(3200) })).max(4).default([]),
  context: z.string().max(100).regex(/^\/(contacts|listings|transactions)\/[0-9a-f-]{36}$/i).optional(),
  state: conversationState.optional(),
});
export type ChatInput = z.infer<typeof chatInput>;
export function estimatedCost(input: number, output: number) {
  // Conservative input rate includes cache writes; no cached-token discount.
  return (input * 0.125 + output * 0.5) / 1_000_000;
}

// Deliberately accepts NO arguments. Identical bytes for every member/question/result.
// No intent, counts, dates, IDs, CRM values or conversation are transmitted.
export const GENERIC_PLAN_BODY=JSON.stringify({model:MODEL,store:false,service_tier:'default',reasoning:{effort:'none'},max_output_tokens:700,
 instructions:'Propose un ordre générique de sections pour une réponse de lecture seule. Aucun dossier réel ne t’est fourni. Réponds uniquement par un objet JSON contenant sections, un tableau sans doublon des clés autorisées : summary, people, deadlines, inventory, results. Aucun autre champ, aucun texte libre, aucun outil.',
 input:[{role:'user',content:'Organiser un aperçu générique : résumé, personnes, échéances, inventaire, résultats. Utiliser uniquement les clés de section autorisées.'}],
});
