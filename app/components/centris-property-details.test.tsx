import {it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {CentrisPropertyDetails,CentrisChangeBadge} from './centris-property-details';
import {mapDetails} from '../lib/centris/details';
import type {Listing} from '../data/listing-types';
it('shows source units and plain description, hides unknown numbers',()=>{
 const listing={centrisListingKey:'test',centrisStandardStatus:'Active',centrisDetails:mapDetails({LivingArea:72.6,LivingAreaUnits:'Square Meters',PublicRemarks:'<script>unsafe()</script>'})} as Listing;
 const html=renderToStaticMarkup(<CentrisPropertyDetails listing={listing}/>);
 expect(html).toContain('m²');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');expect(html).not.toContain('<dt>Chambres</dt>');
 expect(renderToStaticMarkup(<CentrisChangeBadge listing={listing}/>)).toBe('');
});
it('distinguishes a changed source status from CRM finalization',()=>{
 const listing={centrisListingKey:'test',centrisStandardStatus:'Closed',centrisDetails:{...mapDetails({}),last_change_at:'2026-11-13T00:00:00Z',last_change_kind:'status'}} as Listing;
 const html=renderToStaticMarkup(<CentrisPropertyDetails listing={listing}/>);
 expect(html).toContain('Closed');expect(html).toContain('Aucune vente ou location');expect(html).toContain('Changement Centris à vérifier');
});
