import {describe,it,expect} from 'vitest';
import {parseContractDates} from './parse-contract-dates';
import {parseCentrisText} from './parse';
import {syntheticCentrisFixtures} from './synthetic-fixtures';
import {emptyListingDraft} from '../listings/editor';
import {applyCentrisListingImport,defaultCentrisListingImportSelection} from './listing-form-import';
import {parseListingDraft,parseListingUpdate} from '../listings/persistence';
const parse=(text:string)=>parseContractDates([{pageNumber:7,text}]);
describe('Centris brokerage contract dates',()=>{
 it.each(["Date de signature du contrat 2026-09-09 Date d'expiration 2027-03-31","2026-09-09 Date de signature du contrat 499 000 $ Dernier prix 2027-03-31 Date d’expiration","Date  de signature\ndu contrat : 2026-09-09 Date d’expiration : 2027-03-31"] )('reads labelled dates with PDF variation: %s',text=>{
  expect(parse(text).dates).toEqual({contractSignedDate:'2026-09-09',contractExpirationDate:'2027-03-31'});
 });
 it('does not borrow the other date when one field is blank',()=>{
  expect(parse("Date de signature du contrat 2026-09-09 Date d'expiration").dates.contractExpirationDate).toBeNull();
  expect(parse("2026-09-09 Date de signature du contrat Date d'expiration").dates.contractExpirationDate).toBeNull();
 });
 it('rejects impossible and conflicting dates with a warning',()=>{
  for(const text of ["Date d'expiration 2027-02-30","Date d'expiration 2027-03-31 Date d'expiration 2027-04-30"]){
   const r=parse(text);expect(r.dates.contractExpirationDate).toBeNull();expect(r.warnings.length).toBeGreaterThan(0);
  }
 });
 it('ignores printing, acceptance and notary dates',()=>{
  expect(parse('Imprimé le 2026-09-14 Date PA acceptée 2026-09-12 Notaire 2026-10-20').dates).toEqual({contractSignedDate:null,contractExpirationDate:null});
 });
 it('imports later-page dates while preserving broker and market date, then respects manual edits',()=>{
  const fixture=Object.values(syntheticCentrisFixtures)[0];
  const result=parseCentrisText({...fixture,pages:[...fixture.pages,{pageNumber:9,text:"Date de signature du contrat 2026-09-09 Date d'expiration 2027-03-31"}]},'synthetic.pdf');
  const draft={...emptyListingDraft('france'),listingDate:'2026-09-12'};
  const imported=applyCentrisListingImport(draft,result,defaultCentrisListingImportSelection(draft,result));
  expect(imported).toMatchObject({broker:'france',listingDate:'2026-09-12',contractSignedDate:'2026-09-09',expirationDate:'2027-03-31'});
  expect(result.sourcePages.contractSignedDate).toEqual([9]);
  const manual={...imported,contractSignedDate:'2026-09-08',expirationDate:'2027-04-30'};
  expect(applyCentrisListingImport(manual,result,defaultCentrisListingImportSelection(manual,result))).toMatchObject({contractSignedDate:'2026-09-08',expirationDate:'2027-04-30'});
 });
 it('validates, saves and clears manual dates without requiring them',()=>{
  expect(parseListingDraft({...emptyListingDraft('maxime'),contractSignedDate:'2026-09-09',expirationDate:'2027-03-31'})).toMatchObject({contractSignedDate:'2026-09-09',expirationDate:'2027-03-31'});
  expect(parseListingDraft(emptyListingDraft('maxime'))).not.toBeNull();
  expect(parseListingUpdate({contractSignedDate:null,expirationDate:null})).toEqual({contractSignedDate:null,expirationDate:null});
  expect(parseListingUpdate({contractSignedDate:'2026-02-30'})).toBeNull();
 });
});
