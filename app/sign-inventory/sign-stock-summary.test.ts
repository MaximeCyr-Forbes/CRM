import {describe,expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Stock} from '../lib/sign-inventory/model';
import {SignStockSummary} from './sign-stock-summary';

const sign=(label:string,total:number,used:number):Stock=>({id:`sign:${label}`,kind:'sign',broker:label.toLowerCase(),label,total,used,available:total-used,version:0});
const render=(stock:Stock[])=>renderToStaticMarkup(createElement(SignStockSummary,{stock}));
describe('warehouse sign summary uses server availability without subtracting twice',()=>{
 it.each([
  ['France',7,4,3],['Maxime',5,0,5],['Sandrine',2,2,0],
  ['France after return',7,3,4],['France after assignment',7,5,2],['France after stock addition',8,4,4],
 ] as const)('%s: total %i / active %i → warehouse %i',(label,total,used,expected)=>{
  const html=render([sign(label,total,used)]);
  expect(html).toContain(`<dd>${total}<span`);
  expect(html).toContain(`<dt>${label}</dt><dd>${expected}</dd>`);
 });
 it('keeps all brokers including zero and excludes BAC/addons',()=>{
  const html=render([sign('France',7,4),sign('Maxime',5,0),sign('Sandrine',2,2),{...sign('BAC',9,1),kind:'bac'}]);
  expect(html).toContain('<dt>Sandrine</dt><dd>0</dd>');
  expect(html).not.toContain('BAC');
  expect(html.match(/<dt>/g)).toHaveLength(6);
 });
 it('clamps inconsistent negative availability without showing a negative warehouse count',()=>{
  expect(render([sign('France',2,3)])).toContain('<dt>France</dt><dd>0</dd>');
 });
});
