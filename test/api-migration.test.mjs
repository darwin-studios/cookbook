import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { search, getSearch, getActRequest, getThread, fileContext } from '../lib/darwin.mjs';
import { found } from './fixtures.mjs';
const ok = body => ({ ok: true, json: async () => body });
test('follow-ups inherit limits instead of resetting the initial search', async () => {
 const first=found([],{responseId:'sresp_initial',searchToken:'owner-token'});
 await search('paper search',{agentCount:3,maxResults:12,fetchImpl:async()=>ok(first)});
 await search('only 2026',{previousResponseId:first.responseId,fetchImpl:async(_u,o)=>{
  const body=JSON.parse(o.body);assert.equal('agentCount' in body,false);assert.equal('maxResults' in body,false);
  assert.equal(o.headers['X-Search-Token'],'owner-token');return ok(found());
 }});
});
test('Get search preserves original ownership token', async () => {
 await getSearch('srch_saved',{searchToken:'owner',fetchImpl:async(u,o)=>{
  const url = new URL(u);assert.equal(url.pathname,'/api/v3/search/srch_saved');assert.equal(url.searchParams.get('limit'),'20');assert.equal(o.headers['X-Search-Token'],'owner');return ok({responses:[]});
 }});
});
test('Get Act request without state asks only for the receipt',async()=>{
 await getActRequest('actreq_saved',{fetchImpl:async u=>{assert.ok(u.endsWith('/act/requests/actreq_saved'));return ok({threads:[]});}});
});
test('missing or wrong child state cannot masquerade as a provider reply',async()=>{
 for (const body of [{threads:[]},{threads:[{threadId:'child',state:{thread:'other',messages:[]}}]}])
  await assert.rejects(getThread('child',{actRequestId:'actreq_saved',fetchImpl:async()=>ok(body)}),/matching thread state/);
 await assert.rejects(getActRequest('id',{includeThreadState:true,cursor:'c'}),/exact child/);
});
test('file context is real file bytes with supported MIME and bounded payload',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cookbook-file-'));
 try {
  await writeFile(join(dir,'invoice.pdf'),'%PDF-1.4 sample');
  const c=await fileContext(join(dir,'invoice.pdf'));
  assert.equal(c.mimeType,'application/pdf');assert.equal(c.name,'invoice.pdf');assert.equal(Buffer.from(c.data,'base64').toString(),'%PDF-1.4 sample');
  await writeFile(join(dir,'empty.png'),'');await assert.rejects(fileContext(join(dir,'empty.png')),/nonempty/);
  await assert.rejects(fileContext(join(dir,'video.mp4')),/Use PDF/);
 } finally {await rm(dir,{recursive:true,force:true});}
});
