import type { Transaction } from "../../data/transaction-types";

export function transactionMatchesSearch(
  transaction: Pick<Transaction, "address" | "centrisNumber">,
  contactNames: string,
  search: string,
) {
  const terms = search.toLocaleLowerCase("fr-CA").trim().split(/\s+/).filter(Boolean);
  const haystack = `${transaction.address} ${transaction.centrisNumber} ${contactNames}`.toLocaleLowerCase("fr-CA");
  return terms.every((term) => haystack.includes(term));
}
