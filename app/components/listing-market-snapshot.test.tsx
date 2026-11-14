import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {emptyListingDraft} from '../lib/listings/editor';
import {ListingMarketSnapshot} from './listing-market-snapshot';
import {useListingReport} from '../lib/listings/use-listing-report';
vi.mock('../lib/listings/use-listing-report',()=>({useListingReport:vi.fn()}));
it('keeps five indicators and the transaction link without displaying or erasing expiration',()=>{
 const data={listing:{...emptyListingDraft('maxime'),id:'qa',listingDate:'2026-01-01',expirationDate:'2026-12-31'},tracking:{tasks:[],visits:[{}]},offers:[{},{}],transactionLink:{transactionId:'linked-transaction'}};
 vi.mocked(useListingReport).mockReturnValue({data,isLoading:false,error:null,retry:vi.fn()} as unknown as ReturnType<typeof useListingReport>);
 const before=JSON.stringify(data);
 const html=renderToStaticMarkup(<ListingMarketSnapshot listingId="qa"/>);
 expect(html.match(/<article>/g)).toHaveLength(5);
 for(const label of ['Jours en marché','Date de mise en marché','Visites','Offres','Progression checklist','TRANSACTION LIÉE'])expect(html).toContain(label);
 expect(html).not.toMatch(/expiration/i);expect(html).toContain('<strong>1</strong>');expect(html).toContain('<strong>2</strong>');
 expect(JSON.stringify(data)).toBe(before);
});
