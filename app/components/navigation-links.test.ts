import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('liens de dossiers et applications autorisées', () => {
  it.each([
    ['app/components/account-menu.tsx', '<a href="/oauth/connections">'],
    ['app/oauth/connections/page.tsx', '<a href="/">'],
    ['app/components/contact-property-history.tsx', '<a href={`/transactions/${transaction.id}`}>'],
  ])('préserve une navigation native sans le préchargement RSC défaillant : %s', (file, anchor) => {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain(anchor);
    expect(source).not.toMatch(/from ['"]next\/link['"]/);
  });
});
