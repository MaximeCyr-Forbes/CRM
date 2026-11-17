import {readFileSync,existsSync} from 'node:fs';
import {expect,it} from 'vitest';
import {guides,modules} from './knowledge';
it.each(Object.values(modules))('module route and UI evidence remain present: $label',m=>{expect(existsSync(`app${m.href}/page.tsx`)).toBe(true);expect(readFileSync(m.source,'utf8')).toContain(m.anchor);});
it.each(guides)('verified guide anchors: $id',g=>{const source=readFileSync(g.source,'utf8');for(const text of g.anchors)expect(source).toContain(text);});
