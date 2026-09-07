import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('unchanged background session checks neither cover nor redraw the page', async () => {
  const source=await readFile(new URL('../web/product_v2_0_1/product.js',import.meta.url),'utf8');
  const start=source.indexOf('  let sessionRefresh=null;');
  const end=source.indexOf("  window.addEventListener('pageshow'",start);
  const events=[];
  const session={enabled:true,authenticated:true,hostedDemo:true};
  const context=vm.createContext({
    state:{auth:{ready:true,...session}},
    document:{body:{classList:{add:()=>events.push('cover'),remove:()=>{}}}},
    request:async()=>session,hostedSession:s=>s.hostedDemo,
    navigate:async()=>events.push('navigate'),clearPrivateState:()=>events.push('clear'),
  });
  vm.runInContext(source.slice(start,end),context);
  await vm.runInContext('refreshSession(false)',context);
  assert.deepEqual(events,[]);
  await vm.runInContext('refreshSession(true)',context);
  assert.deepEqual(events,['cover','navigate']);
});
