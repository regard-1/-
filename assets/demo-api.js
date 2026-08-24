(() => {
  const storageKey='dotbest-consumer-demo-v2';
  const isoOffset=days=>new Date(Date.now()+days*86400000).toISOString();
  const topics=[
    {id:'nmn',short:'N',title:'NMN是什么',subtitle:'从基本概念到常见关注点',category:'能量与活力',color:'#c69b60',read_time:3,simple_intro:'用通俗语言了解NMN的基本概念和信息边界。',professional_intro:'了解NMN的化学属性、研究语境与证据边界。',simple_content:'NMN是一种与细胞能量代谢研究相关的物质。了解它时，建议重点区分基础研究、人体研究和商品宣传，不把保健信息当作疾病治疗建议。',professional_content:'NMN是烟酰胺单核苷酸，常见讨论与NAD+代谢通路有关。现有研究类型、样本规模和结论边界并不完全一致，解读时应关注研究对象、终点、剂量与持续时间。',key_points:['先理解成分是什么，再查看具体产品信息。','研究结论需要结合研究类型和适用范围理解。','正在用药或存在健康问题时，先咨询专业医疗人员。'],caution:'不能替代药物或疾病治疗。孕期、哺乳期、未成年人以及正在接受治疗的人群，应先咨询专业医疗人员。',source:'演示知识库 · 内容经合规规则整理',updated_at:isoOffset(-3)},
    {id:'ergothioneine',short:'麦',title:'麦角硫因怎么理解',subtitle:'抗氧化相关信息的正确阅读方式',category:'抗氧化',color:'#8870c7',read_time:4,simple_intro:'认识麦角硫因，以及如何判断相关信息是否可靠。',professional_intro:'从来源、研究指标与证据等级理解麦角硫因。',simple_content:'麦角硫因是一种天然存在的含硫化合物，经常出现在抗氧化相关讨论中。阅读相关内容时，应关注信息来源和具体研究条件。',professional_content:'麦角硫因属于含硫氨基酸衍生物，相关研究涉及转运机制和氧化应激指标。研究指标的变化不等同于临床治疗效果，需要避免跨越证据层级做结论。',key_points:['天然来源不等于对所有人都适合。','抗氧化相关指标不能直接等同于治疗效果。','比较产品时应同时关注成分、规格和信息透明度。'],caution:'对原料来源或具体使用方式存在疑问时，应查看产品说明并咨询合格专业人员。',source:'演示知识库 · 内容经合规规则整理',updated_at:isoOffset(-5)},
    {id:'coq10',short:'Q',title:'辅酶Q10基础知识',subtitle:'认识常见形式与信息重点',category:'能量与活力',color:'#df7567',read_time:4,simple_intro:'了解辅酶Q10的基本概念、常见讨论和注意事项。',professional_intro:'查看辅酶Q10的形式差异、研究指标和使用边界。',simple_content:'辅酶Q10是人体内存在的一类物质，常与能量代谢相关讨论联系在一起。产品信息中可能出现不同形式，应以清晰标注和可靠来源为先。',professional_content:'辅酶Q10参与线粒体电子传递相关过程，常见产品形式包括氧化型和还原型。具体吸收与使用信息需要结合剂型、研究条件和个体情况理解。',key_points:['先确认产品标注的具体形式和规格。','不要仅根据单一宣传语判断。','与药物同时使用前应咨询医生或药师。'],caution:'正在服用抗凝药物或接受治疗的人群，不应自行根据网络内容调整使用方案。',source:'演示知识库 · 内容经合规规则整理',updated_at:isoOffset(-2)},
    {id:'daily',short:'日',title:'日常营养怎么开始',subtitle:'从饮食、作息和真实需求开始',category:'日常营养',color:'#4c9a7d',read_time:3,simple_intro:'先梳理生活方式，再决定是否需要继续了解具体成分。',professional_intro:'用需求、膳食结构与证据边界评估补充信息。',simple_content:'日常健康管理通常先从规律饮食、睡眠、活动和专业检查建议开始。保健品不是越多越好，也不适合代替均衡饮食。',professional_content:'评估营养补充信息时，应先识别膳食来源、可能缺口、证据强度和安全上限，避免多种产品造成重复摄入。',key_points:['先明确自己真正想解决的问题。','记录正在使用的产品，避免重复。','有特殊健康情况时优先咨询专业人员。'],caution:'不要根据平台内容自行停药、换药或延误就医。',source:'演示知识库 · 内容经合规规则整理',updated_at:isoOffset(-1)},
    {id:'safety',short:'安',title:'如何安全阅读保健信息',subtitle:'识别夸大表达和高风险建议',category:'安全与注意',color:'#66748c',read_time:5,simple_intro:'学会区分知识介绍、产品信息和医疗建议。',professional_intro:'从证据等级、终点与适用范围识别信息风险。',simple_content:'遇到“保证有效”“替代治疗”“所有人都适合”等表达时，应保持谨慎。可靠内容会说明来源、适用边界和不确定性。',professional_content:'证据判断应区分体外、动物、观察性和随机对照研究，并关注替代终点与临床终点的差异。单项研究不能自动形成普遍结论。',key_points:['绝对功效表达通常需要警惕。','用户体验不能代替系统性证据。','紧急或持续不适应及时寻求医疗帮助。'],caution:'如出现紧急身体不适，请立即联系当地急救或专业医疗机构。',source:'演示知识库 · 安全阅读指南',updated_at:isoOffset(-1)}
  ];
  const defaults=()=>({
    session:null,
    preferences:{display_name:'林女士',city:'上海',primary_goal:'先了解基础知识',available_goals:['先了解基础知识','比较成分信息','管理日常提醒','继续已有咨询'],content_mode:'simple',save_history:true,personalized_content:true,save_local:true,service_messages:true,channel:'站内消息',frequency:'只接收我设置的提醒',quiet_start:'22:00',quiet_end:'08:00',family_members:[]},
    interests:['NMN','日常营养'],saved:['nmn','safety'],
    chat:[{role:'assistant',content:'你好，我可以用简单或专业的方式介绍相关知识。你想从哪个问题开始？',notice:'内容仅用于知识了解，不构成医疗诊断。',actions:[{label:'看看知识中心',action:'knowledge'},{label:'联系人工',action:'human'}],time_label:'刚刚'}],
    reminders:[{id:'r1',title:'继续了解NMN基础知识',description:'回顾已收藏的入门内容',day:String(new Date(Date.now()+86400000).getDate()).padStart(2,'0'),month:new Intl.DateTimeFormat('zh-CN',{month:'short'}).format(new Date(Date.now()+86400000)),schedule_label:'明天 19:30',channel:'站内消息',status:'active',status_label:'等待提醒'}],
    messages:[{id:'m1',type:'reminder',icon:'◷',title:'你设置的提醒将在明天生效',summary:'继续了解NMN基础知识 · 明天 19:30',content:'这是你主动设置的提醒。到达时间后，我们会通过站内消息提醒你继续阅读。',time_label:'10分钟前',read:false,action:{page:'reminders',label:'管理提醒'}},{id:'m2',type:'knowledge',icon:'◇',title:'你关注的安全阅读指南已更新',summary:'新增了如何识别绝对功效表达的说明',content:'安全阅读指南更新了信息来源、绝对功效表达和紧急情况处理等内容。',time_label:'昨天',read:false,action:{page:'knowledge',label:'查看知识内容'}},{id:'m3',type:'service',icon:'↗',title:'人工服务入口随时可用',summary:'复杂问题可以从AI咨询页转人工',content:'当问题涉及用药、诊断、紧急身体状况或AI未能解决时，你可以随时选择人工服务。',time_label:'3天前',read:true,action:{page:'consult',label:'进入咨询'}}],
    feedback:[]
  });
  let db=(()=>{try{return JSON.parse(localStorage.getItem(storageKey))||defaults()}catch{return defaults()}})();
  const persist=()=>{if(db.preferences.save_local)localStorage.setItem(storageKey,JSON.stringify(db));else localStorage.removeItem(storageKey)};
  const ok=(data,status=200)=>Promise.resolve(new Response(JSON.stringify({success:true,data,error:null,request_id:'consumer-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const fail=(message,status=404)=>Promise.resolve(new Response(JSON.stringify({success:false,data:null,error:{message},request_id:'consumer-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const body=options=>{try{return JSON.parse(options?.body||'{}')}catch{return {}}};
  const topicView=t=>({...t,saved:db.saved.includes(t.id)});
  const unread=()=>db.messages.filter(x=>!x.read).length;
  const requireSession=()=>Boolean(db.session);

  function aiAnswer(message,mode){
    const text=message.toLowerCase();
    if(/胸痛|呼吸困难|晕厥|急救|严重不适|自杀/.test(text))return {content:'你描述的情况可能需要及时的专业医疗帮助。请不要等待平台回复，立即联系当地急救或前往医疗机构。',notice:'AI不会对紧急身体状况作诊断。',actions:[{label:'联系人工服务',action:'human'}]};
    if(/用药|药物|治疗|诊断|怀孕|孕期|哺乳|儿童/.test(text))return {content:'这个问题涉及用药、诊断或特殊人群，不能仅根据平台知识给出个体化结论。建议携带正在使用的产品和药物信息咨询医生或药师。',notice:'为避免误导，本次不提供具体使用方案。',actions:[{label:'联系人工顾问',action:'human'},{label:'查看安全指南',action:'knowledge'}]};
    const found=topics.find(t=>text.includes(t.id)||text.includes(t.title.slice(0,4))||(t.id==='coq10'&&text.includes('q10'))||(t.id==='daily'&&/营养|日常/.test(text)));
    if(found){return {content:mode==='professional'?found.professional_content:found.simple_content,notice:found.caution,actions:[{label:'查看完整知识',action:'knowledge'},{label:'设置以后提醒',action:'reminder'}]};}
    if(/区别|比较|怎么选/.test(text))return {content:mode==='professional'?'比较成分时可以从研究语境、具体形式、规格、来源透明度和安全边界五个方面逐项查看。不同成分并不适合用单一“更好”结论概括。':'可以先比较五件事：是什么、为什么关注、信息来源、使用边界和注意事项。不要只根据一句宣传语决定。',notice:'如果你告诉我想比较的两个成分，我可以继续解释。',actions:[{label:'进入知识中心',action:'knowledge'}]};
    return {content:mode==='professional'?'我会先确认你的具体问题和希望的详细程度，再基于经审核知识解释，并明确证据边界。你可以补充想了解的成分或信息点。':'可以的。请告诉我你想了解哪个成分，或者最关心“是什么、有什么区别、注意什么”中的哪一项。',notice:'不需要提供疾病、用药等敏感信息也可以先了解基础知识。',actions:[{label:'看看知识中心',action:'knowledge'},{label:'联系人工',action:'human'}]};
  }

  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    const path=url.pathname.replace(/^\/[^/]+(?=\/api\/)/,'');
    const method=(options.method||'GET').toUpperCase();

    if(path==='/api/v1/user/session'&&method==='POST'){
      const data=body(options); db.session={id:'demo-user',display_name:db.preferences.display_name,mode:data.mode||'simple',purpose:data.purpose||'first'}; db.preferences.content_mode=db.session.mode;db.preferences.save_history=data.save_history!==false;db.preferences.save_local=data.save_history!==false;persist();return ok(db.session,201);
    }
    if(path==='/api/v1/user/session')return requireSession()?ok({...db.session,display_name:db.preferences.display_name,mode:db.preferences.content_mode}):fail('尚未开始体验',401);
    if(path==='/api/v1/user/reset'&&method==='POST'){db=defaults();localStorage.removeItem(storageKey);return ok({reset:true});}
    if(!requireSession())return fail('请先开始体验',401);

    if(path==='/api/v1/user/home'){
      const next=db.reminders.find(x=>x.status==='active');
      return ok({date_label:new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date()),greeting:db.preferences.display_name,topics:topics.slice(0,4).map(topicView),preferences:db.preferences,recent_conversation:{title:'怎样判断保健信息是否可靠？',summary:'上次我们聊到了内容来源、绝对功效表达和适用边界。',updated_at:isoOffset(-1)},next_reminder:next?{...next}:null,unread_messages:unread()});
    }
    if(path==='/api/v1/user/knowledge'){
      const q=(url.searchParams.get('q')||'').trim().toLowerCase();
      return ok({items:topics.filter(t=>!q||`${t.title}${t.subtitle}${t.category}${t.simple_intro}`.toLowerCase().includes(q)).map(topicView)});
    }
    let match=path.match(/^\/api\/v1\/user\/knowledge\/([\w-]+)$/);
    if(match){const t=topics.find(x=>x.id===match[1]);return t?ok(topicView(t)):fail('内容不存在');}
    match=path.match(/^\/api\/v1\/user\/focus\/([\w-]+)$/);
    if(match&&method==='POST'){const id=match[1],index=db.saved.indexOf(id);if(index>=0)db.saved.splice(index,1);else db.saved.push(id);persist();return ok({saved:index<0});}
    if(path==='/api/v1/user/focus')return ok({interests:db.interests,available_interests:['NMN','麦角硫因','辅酶Q10','日常营养','安全阅读'],saved_topics:topics.filter(t=>db.saved.includes(t.id)).map(topicView),pending_questions:1});
    if(path==='/api/v1/user/interests'&&method==='POST'){const name=body(options).name,index=db.interests.indexOf(name);if(index>=0)db.interests.splice(index,1);else db.interests.push(name);persist();return ok({interests:db.interests});}

    if(path==='/api/v1/user/conversation')return ok({messages:db.chat,quick_prompts:['NMN是什么？','辅酶Q10和麦角硫因有什么区别？','如何识别夸大的保健信息？'],save_history:db.preferences.save_history});
    if(path==='/api/v1/user/conversation/messages'&&method==='POST'){
      const data=body(options),answer=aiAnswer(String(data.message||''),data.mode||db.preferences.content_mode),stamp='刚刚';
      db.chat.push({role:'user',content:String(data.message||''),time_label:stamp},{role:'assistant',...answer,time_label:stamp});
      if(data.save_history!==false&&db.preferences.save_history)persist();return ok({messages:db.chat});
    }
    if(path==='/api/v1/user/conversation/clear'&&method==='POST'){db.chat=[defaults().chat[0]];persist();return ok({cleared:true});}
    if(path==='/api/v1/user/support/handoff'&&method==='POST')return ok({status_label:'人工服务入口已准备',description:'请选择方便的方式和时间。演示环境不会真实联系你。'});

    if(path==='/api/v1/user/reminders'&&method==='GET')return ok({items:db.reminders,quiet_hours:`${db.preferences.quiet_start}—${db.preferences.quiet_end}`});
    if(path==='/api/v1/user/reminders'&&method==='POST'){
      const data=body(options),date=new Date(Date.now()+(data.when==='month'?30:data.when==='week'?7:1)*86400000);const item={id:`r${Date.now()}`,title:data.title,description:'由你主动创建的服务提醒',day:String(date.getDate()).padStart(2,'0'),month:new Intl.DateTimeFormat('zh-CN',{month:'short'}).format(date),schedule_label:data.when==='month'?'一个月后':data.when==='week'?'一周后':'明天这个时间',channel:data.channel,status:'active',status_label:'等待提醒'};db.reminders.push(item);persist();return ok(item,201);
    }
    match=path.match(/^\/api\/v1\/user\/reminders\/([\w-]+)\/snooze$/);
    if(match&&method==='POST'){const item=db.reminders.find(x=>x.id===match[1]);if(item){item.schedule_label='已延后一天';persist();}return ok(item||{});}
    match=path.match(/^\/api\/v1\/user\/reminders\/([\w-]+)\/toggle$/);
    if(match&&method==='POST'){const item=db.reminders.find(x=>x.id===match[1]);if(item){item.status=item.status==='active'?'paused':'active';item.status_label=item.status==='active'?'等待提醒':'已暂停';persist();}return ok(item||{});}

    if(path==='/api/v1/user/messages')return ok({items:db.messages,unread:unread(),frequency_label:db.preferences.frequency});
    if(path==='/api/v1/user/messages/read-all'&&method==='POST'){db.messages.forEach(x=>x.read=true);persist();return ok({unread:0});}
    match=path.match(/^\/api\/v1\/user\/messages\/([\w-]+)$/);
    if(match){const item=db.messages.find(x=>x.id===match[1]);if(!item)return fail('消息不存在');item.read=true;persist();return ok({...item,unread:unread()});}

    if(path==='/api/v1/user/preferences'&&method==='GET')return ok(db.preferences);
    if(path==='/api/v1/user/preferences'&&method==='POST'){
      const data=body(options);Object.entries(data).forEach(([key,value])=>{if(key==='mute_type'){db.preferences.service_messages=false}else if(key in db.preferences)db.preferences[key]=value});
      if('save_local'in data&&!data.save_local)localStorage.removeItem(storageKey);else persist();
      if(db.session){db.session.display_name=db.preferences.display_name;db.session.mode=db.preferences.content_mode;}return ok(db.preferences);
    }
    if(path==='/api/v1/user/feedback'&&method==='POST'){db.feedback.push({...body(options),created_at:new Date().toISOString()});persist();return ok({received:true},201);}
    return fail('演示接口不存在');
  };
})();
