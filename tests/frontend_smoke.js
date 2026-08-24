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
  assert.equal(workbench.body.data.metrics.due,11);
  assert.equal(workbench.body.data.categories.length,4);

  const audience=await request('/api/v1/private/user-assets/nmn/customers');
  assert.equal(audience.body.data.items.length,4);
  assert.ok(audience.body.data.items[0].ai_profile.summary);
  assert.ok(audience.body.data.items[0].ai_profile.evidence.length);
  assert.ok(audience.body.data.items[0].persona.occupation);
  assert.ok(audience.body.data.items[0].persona.non_health_topics.length);
  assert.ok(audience.body.data.items[0].persona.confidence < 100);

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
  assert.equal(tasks.body.data.pending,11);
  assert.equal(tasks.body.data.categories.length,7);
  assert.equal(tasks.body.data.performance.metrics.opening_rate,63.8);
  assert.ok(tasks.body.data.performance.optimization.adjustments.length >= 3);
  const careTasks=await request('/api/v1/private/tasks?category=purchase_care');
  assert.equal(careTasks.body.data.items.length,2);
  const birthday=await request('/api/v1/private/tasks/t9');
  assert.equal(birthday.body.data.category,'birthday');
  const birthdayConversation=await request('/api/v1/private/customers/3/agent-conversations',{method:'POST',body:'{}'});
  const birthdayGenerated=await request(`/api/v1/private/agent-conversations/${birthdayConversation.body.data.id}/messages`,{method:'POST',body:JSON.stringify({message:birthday.body.data.prompt,scene:'ice_break',task_id:'t9'})});
  assert.match(birthdayGenerated.body.data.suggestion.reply,/生日快乐/);
  assert.doesNotMatch(birthdayGenerated.body.data.suggestion.reply,/内部|意向度|转化可能|职业|年龄/);
  const refreshed=await request('/api/v1/private/tasks/optimization/refresh',{method:'POST',body:'{}'});
  assert.equal(refreshed.body.data.version,'D+1 V4');
  const done=await request('/api/v1/private/tasks/t1/status',{method:'POST',body:JSON.stringify({status:'done'})});
  assert.equal(done.body.data.status,'done');

  const forbidden=await request('/api/v1/private/orders');
  assert.equal(forbidden.status,404);
  console.log('operator frontend smoke: all checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
