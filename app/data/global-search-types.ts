export type GlobalSearchResultKind = "contact" | "listing" | "transaction";

export type GlobalSearchResult = {
  id: string;
  kind: GlobalSearchResultKind;
  title: string;
  detail: string;
  href: string;
};
