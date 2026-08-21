(() => {
  const now = () => new Date().toISOString();
  const categories = [
    {code:'nmn',name:'NMN人群',description:'关注细胞能量与健康管理',color:'#c89b5a',customer_count:4,average_score:88,buyers:3,revenue:799800,conversion_rate:75},
    {code:'ergothioneine',name:'麦角硫因人群',description:'关注抗氧化与精细化养护',color:'#9d7bea',customer_count:3,average_score:81,buyers:2,revenue:399700,conversion_rate:66.7},
    {code:'coq10',name:'辅酶Q10人群',description:'关注心脏活力与日常能量',color:'#e16f62',customer_count:4,average_score:79,buyers:3,revenue:228600,conversion_rate:75},
    {code:'regular',name:'常规品人群',description:'基础营养与日常健康管理',color:'#4aa88a',customer_count:4,average_score:82,buyers:4,revenue:178500,conversion_rate:100}
  ];

  const baseProfiles = [
    {id:1,name:'林女士',nickname:'小林',phone:'138****8001',city:'上海',owner:'周顾问',member_level:'黑金',points:253,total_amount:3398,order_count:2,last_interaction:'咨询服用周期，希望方案简单一些',assetCodes:['nmn','coq10'],tags:['NMN人群','高价值','近期活跃','黑金会员','可触达']},
    {id:2,name:'陈先生',nickname:'陈哥',phone:'139****6720',city:'杭州',owner:'王顾问',member_level:'铂金',points:168,total_amount:2199,order_count:2,last_interaction:'关注抗氧化搭配与长期使用成本',assetCodes:['ergothioneine','regular'],tags:['麦角硫因人群','品质敏感','内容高互动','铂金会员']},
    {id:3,name:'赵女士',nickname:'赵姐',phone:'136****1058',city:'苏州',owner:'李顾问',member_level:'黄金',points:96,total_amount:1298,order_count:1,last_interaction:'询问辅酶Q10日常补充建议',assetCodes:['coq10','regular'],tags:['辅酶Q10人群','家庭健康','近期咨询','黄金会员']},
    {id:4,name:'周先生',nickname:'老周',phone:'137****4436',city:'南京',owner:'张顾问',member_level:'白银',points:62,total_amount:699,order_count:1,last_interaction:'参加社群直播并领取常规品优惠券',assetCodes:['regular','nmn'],tags:['常规品人群','社群活跃','价格敏感','可触达']}
  ];

  const audienceName = code => categories.find(item => item.code === code)?.name || '用户资产';
  const makeCustomer = item => {
    const assets = item.assetCodes.map((code,index) => ({audience_code:code,name:audienceName(code),basis_label:index ? '互动与咨询证据' : '历史购买记录',score:Math.max(68,94-index*17)}));
    const summary = `${item.name}由${item.owner}负责，当前为${item.member_level}会员，累计购买${item.order_count}次、消费¥${item.total_amount.toLocaleString('zh-CN')}。最近${item.last_interaction}，适合基于事实、节奏清晰的持续沟通。`;
    const aiProfile = {data_version:'demo-v1',summary,tags:item.tags,suggestions:['结合最近购买或互动周期做关怀，先确认实际体验，再提出下一步建议。','避免疾病诊断、绝对功效或夸大承诺，保留用户自主判断空间。'],evidence:[{label:`${item.order_count}笔订单 / ¥${item.total_amount.toLocaleString('zh-CN')}`},{label:item.last_interaction},{label:`${item.member_level}会员 / ${item.points}积分`}],confidence:.88,provider:'AI Agent 演示',generated_at:now()};
    return {...item,source:'企业微信',store:'华东运营中心',lifecycle_status:'active_member',marketing_consent:true,last_purchase_at:now(),assets,profile:{summary,tags:item.tags,confidence:.88,generated_at:now()},ai_profile:aiProfile,orders:[{product_name:assets[0].name.replace('人群','健康方案'),amount:item.total_amount,status:'paid',purchased_at:now()}],interactions:[{content:item.last_interaction,channel:'企业微信',occurred_at:now()}],membership:{level:item.member_level,points:item.points,benefits:['会员专属顾问','生日礼遇']},conversations:[]};
  };
  const customers = baseProfiles.map(makeCustomer);
  let loggedIn = false;
  let conversationId = 0;
  const conversations = new Map();

  const ok = (data,status=200) => Promise.resolve(new Response(JSON.stringify({success:true,data,error:null,request_id:'github-pages-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const fail = (message,status=404) => Promise.resolve(new Response(JSON.stringify({success:false,data:null,error:{message},request_id:'github-pages-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const parseBody = options => { try { return JSON.parse(options?.body || '{}'); } catch { return {}; } };

  window.fetch = async (input,options={}) => {
    const url = new URL(typeof input === 'string' ? input : input.url,location.href);
    const path = url.pathname.replace(/^\/[^/]+(?=\/api\/)/,'');
    const method = (options.method || 'GET').toUpperCase();

    if (method === 'POST' && path === '/api/login') { loggedIn = true; return ok({display_name:'运营管理员',role:'superadmin'}); }
    if (method === 'POST' && path === '/api/logout') { loggedIn = false; return ok({}); }
    if (path === '/api/me') return loggedIn ? ok({id:1,display_name:'运营管理员',role:'superadmin'}) : fail('请先登录',401);
    if (!loggedIn) return fail('请先登录',401);

    if (path === '/api/v1/private/dashboard') return ok({metrics:{customers:12,reachable:11,members:12,revenue:1401700,running_campaigns:2,profile_coverage:100},categories,recent_customers:customers.slice(0,4)});
    if (path === '/api/v1/private/user-assets' || path === '/api/v1/private/user-assets/categories') return ok({categories,updated_at:now()});

    let match = path.match(/^\/api\/v1\/private\/user-assets\/([\w-]+)\/customers$/);
    if (match) {
      const audience = categories.find(item => item.code === match[1]);
      if (!audience) return fail('人群不存在');
      const query = (url.searchParams.get('q') || '').trim().toLowerCase();
      let items = customers.filter(c => c.assetCodes.includes(match[1]));
      if (query) items = items.filter(c => `${c.name}${c.phone}${c.owner}`.toLowerCase().includes(query));
      return ok({audience,items,pagination:{page:1,page_size:20,total:items.length}});
    }

    match = path.match(/^\/api\/v1\/private\/customers\/(\d+)$/);
    if (match) return ok(customers.find(c => c.id === Number(match[1])) || customers[0]);
    match = path.match(/^\/api\/v1\/private\/customers\/(\d+)\/ai-profile\/refresh$/);
    if (method === 'POST' && match) {
      const customer = customers.find(c => c.id === Number(match[1])) || customers[0];
      customer.ai_profile.generated_at = now();
      customer.ai_profile.data_version = `demo-${Date.now()}`;
      return ok(customer.ai_profile);
    }

    match = path.match(/^\/api\/v1\/private\/customers\/(\d+)\/agent-conversations$/);
    if (method === 'POST' && match) {
      const id = ++conversationId;
      const conversation = {id,customer_id:Number(match[1]),scene:parseBody(options).scene || 'consult',messages:[]};
      conversations.set(id,conversation);
      return ok(conversation,201);
    }
    match = path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)\/messages$/);
    if (method === 'POST' && match) {
      const conversation = conversations.get(Number(match[1]));
      if (!conversation) return fail('对话不存在');
      const body = parseBody(options);
      const customer = customers.find(c => c.id === conversation.customer_id) || customers[0];
      const reply = `理解您的关注。结合您之前对${customer.assets[0].name}的兴趣，我们可以先确认最看重的是使用周期、体验还是预算，再选择更容易长期坚持的方案。`;
      const suggestion = {reply,alternatives:['可以先从体验方案开始，不急着一次做长期决定。','我先把适合与不适合的情况说明白，您再判断。'],recommendation_reason:`已结合${customer.assets[0].name}归属、历史消费和当前${body.scene || '咨询'}场景`,policy_flags:['非医疗诊断','避免绝对功效'],provider:'AI Agent 演示'};
      conversation.messages.push({role:'customer',content:body.message},{role:'assistant',content:reply,suggestion});
      return ok({conversation_id:conversation.id,suggestion});
    }
    match = path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)$/);
    if (match) {
      const conversation = conversations.get(Number(match[1]));
      return conversation ? ok({conversation:{id:conversation.id,customer_id:conversation.customer_id},messages:conversation.messages}) : fail('对话不存在');
    }

    if (path === '/api/v1/private/members') return ok(customers.map((c,index)=>({customer_id:c.id,name:c.name,member_no:`M2026000${index+1}`,level:c.member_level,growth_value:920-index*145,points:c.points,benefits:c.membership.benefits,owner:c.owner})));
    if (path === '/api/v1/private/campaigns') return ok([{name:'NMN老客复购关怀',audience_name:'NMN人群',status:'running',goal:'复购',reached:486,converted:71},{name:'麦角硫因新品体验旅程',audience_name:'麦角硫因人群',status:'running',goal:'体验转化',reached:328,converted:49},{name:'沉默会员唤醒计划',audience_name:'常规品人群',status:'draft',goal:'召回',reached:0,converted:0}]);
    if (path === '/api/v1/private/communities') return ok([{name:'NMN焕活会员群',theme:'健康管理',owner:'周顾问',member_count:186,active_rate:.64,conversion_rate:.18},{name:'精致抗氧化生活群',theme:'品质养护',owner:'王顾问',member_count:132,active_rate:.58,conversion_rate:.16},{name:'家庭营养交流营',theme:'日常营养',owner:'李顾问',member_count:208,active_rate:.71,conversion_rate:.21}]);
    if (path === '/api/v1/private/analytics/overview') return ok({categories,generated_at:now()});
    return fail('演示接口不存在');
  };
})();

