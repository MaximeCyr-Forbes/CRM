import {describe,expect,it} from 'vitest';
import cases from './engine-source-parity.json';
import {consolidate,confirmManually} from './engine';
describe('Python source 1474422 → native email engine',()=>{
 for(const scenario of cases) it(scenario.name,()=>{
  const actual=consolidate(scenario.input);
  expect(actual.email).toEqual(scenario.expected.email);
  expect(actual.deadlines).toEqual(scenario.expected.deadlines);
  expect(actual.needs_review).toEqual(scenario.expected.needs_review);
  expect(actual.conditions).toEqual(scenario.expected.conditions);
 });
 it('manual confirmation preserves edited dates',()=>{
  const input=structuredClone(cases[0].input);
  input.conditions[0].explicit_date='2026-10-22';
  const actual=confirmManually(input);
  expect(actual.conditions[0].date).toBe('2026-10-22');
  expect(actual.manual_override).toBe(true);
 });
});
