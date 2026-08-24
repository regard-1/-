const assert=require('node:assert/strict');
const path=require('node:path');
global.location={href:'http://127.0.0.1:8091/'};
global.window=global;
require(path.join(__dirname,'..','assets','demo-api.js'));

async function request(url,options){const response=await fetch(url,options);return {status:response.status,body:await response.json()}}

(async()=>{
  let result=await request('/api/me');
  assert.equal(result.status,401);
  result=await request('/api/login',{method:'POST',body:JSON.stringify({username:'operator',password:'demo'})});
  assert.equal(result.status,200);

  const workbench=await request('/api/v1/private/workbench');
  assert.equal(workbench.status,200);
  assert.equal(workbench.body.data.metrics.due,6);
  assert.equal(workbench.body.data.categories.length,4);

  const audience=await request('/api/v1/private/user-assets/nmn/customers');
  assert.equal(audience.body.data.items.length,4);
  assert.ok(audience.body.data.items[0].ai_profile.summary);
  assert.ok(audience.body.data.items[0].ai_profile.evidence.length);

  const conversation=await request('/api/v1/private/customers/1/agent-conversations',{method:'POST',body:'{}'});
  const conversationId=conversation.body.data.id;
  const generated=await request(`/api/v1/private/agent-conversations/${conversationId}/messages`,{method:'POST',body:JSON.stringify({message:'我正在用药，这个能治好吗？',scene:'objection'})});
  const reply=generated.body.data.suggestion.reply;
  assert.match(reply,/医生或药师/);
  assert.doesNotMatch(reply,/高优先|内部|标签|评分|置信度|138\*\*\*\*8001/);
  assert.ok(generated.body.data.suggestion.policy_flags.includes('需要人工确认'));

  const sent=await request(`/api/v1/private/agent-conversations/${conversationId}/mark-sent`,{method:'POST',body:JSON.stringify({reply})});
  assert.equal(sent.body.data.sent,true);

  const tasks=await request('/api/v1/private/tasks');
  assert.equal(tasks.body.data.pending,6);
  const done=await request('/api/v1/private/tasks/t1/status',{method:'POST',body:JSON.stringify({status:'done'})});
  assert.equal(done.body.data.status,'done');

  const forbidden=await request('/api/v1/private/orders');
  assert.equal(forbidden.status,404);
  console.log('operator frontend smoke: all checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
