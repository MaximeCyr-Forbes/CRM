// @vitest-environment jsdom
import React from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {ListingMedia} from './listing-media';
import type {Listing} from '../data/listing-types';
afterEach(cleanup);
const listing={broker:'maxime',civicNumber:'10',address:'Rue Test',apartment:'',city:'Ville Test',province:'QC',postalCode:'',primaryImageUrl:'https://example.test/property.jpg'} as Listing;
it('shows the imported property image and falls back to broker portrait on failure',()=>{
 render(<ListingMedia listing={listing}/>);
 const image=screen.getByRole('img');expect(image.getAttribute('src')).toBe(listing.primaryImageUrl);
 expect(image.getAttribute('alt')).toContain('Propriété');
 fireEvent.error(image);
 expect(screen.getByRole('img').getAttribute('alt')).toContain('courtier responsable');
 expect(screen.getByRole('img').getAttribute('src')).not.toBe(listing.primaryImageUrl);
 fireEvent.error(screen.getByRole('img'));
 expect(screen.getByText('Photo indisponible')).toBeTruthy();
});
it('retains the existing portrait when no property photo is available',()=>{
 render(<ListingMedia listing={{...listing,primaryImageUrl:''}}/>);
 expect(screen.getByRole('img').getAttribute('alt')).toContain('courtier responsable');
});
