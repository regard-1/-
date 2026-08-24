(() => {
  const now=()=>new Date().toISOString();
  const ago=hours=>new Date(Date.now()-hours*3600000).toISOString();
  const categories=[
    {code:'nmn',name:'NMN人群',description:'对精力、健康管理及NMN产品有明确关注',color:'#c89b5a',customer_count:4,due_count:4},
    {code:'ergothioneine',name:'麦角硫因人群',description:'关注抗氧化、精细养护及成分搭配',color:'#8e72c9',customer_count:3,due_count:2},
    {code:'coq10',name:'辅酶Q10人群',description:'关注日常活力、辅酶Q10及家庭健康',color:'#dc7064',customer_count:4,due_count:4},
    {code:'regular',name:'常规品人群',description:'关注基础营养与日常健康产品',color:'#4b9c7f',customer_count:4,due_count:4}
  ];
  const base=[
    {id:1,name:'林女士',phone:'138****8001',city:'上海',owner:'周顾问',member:'黑金会员',stage:'待回复',priority:'高',assetCodes:['nmn','coq10'],product_focus:'NMN焕活方案',last_message:'我担心长期吃会不会负担大，而且价格也要考虑。',last_time:'8分钟前',next_action:'先回应安全与周期顾虑，再给轻量体验选择',next_at:'今天 10:30',consent:'企业微信已授权',traits:['重视安全边界','倾向简单方案','价格需解释价值'],facts:['近30天查看NMN内容4次','主动咨询过使用周期','上次沟通偏好简短回复'],purchase:['NMN体验装 · 2026/07','辅酶Q10基础装 · 2026/05']},
    {id:2,name:'陈先生',phone:'139****6720',city:'杭州',owner:'周顾问',member:'铂金会员',stage:'待首次触达',priority:'中',assetCodes:['ergothioneine','regular'],product_focus:'麦角硫因体验方案',last_message:'在直播间问过麦角硫因和普通抗氧化产品有什么区别。',last_time:'昨天',next_action:'从成分差异切入，邀请其说明最关心的使用目标',next_at:'今天 11:00',consent:'企微好友可触达',traits:['成分知识较深','重视证据来源','不喜欢强推'],facts:['完整观看成分直播','收藏麦角硫因文章2篇','过去对专业解释回应更积极'],purchase:['日常营养组合 · 2026/03']},
    {id:3,name:'赵女士',phone:'136****1058',city:'苏州',owner:'李顾问',member:'黄金会员',stage:'待跟进',priority:'高',assetCodes:['coq10','regular'],product_focus:'辅酶Q10日常方案',last_message:'我先和家里人商量一下，过两天再说。',last_time:'2天前',next_action:'轻量确认家庭使用场景，不制造紧迫感',next_at:'今天 14:00',consent:'企业微信已授权',traits:['家庭决策型','需要低压力沟通','关注日常坚持'],facts:['两次询问家庭成员是否适用','回复集中在午后','对套餐信息停留时间较长'],purchase:['基础维矿组合 · 2026/04']},
    {id:4,name:'周先生',phone:'137****4436',city:'南京',owner:'张顾问',member:'白银会员',stage:'已读未回',priority:'中',assetCodes:['regular','nmn'],product_focus:'日常营养组合',last_message:'收到，我再看看。',last_time:'3天前',next_action:'发送一条可独立阅读的要点，不连续追问',next_at:'今天 16:30',consent:'企微好友可触达',traits:['回复频率低','偏好图文摘要','价格敏感'],facts:['社群内容点击3次','优惠信息有点击无咨询','晚间回复率高'],purchase:['益生菌体验装 · 2026/02']},
    {id:5,name:'吴女士',phone:'135****2916',city:'北京',owner:'周顾问',member:'铂金会员',stage:'对话中',priority:'高',assetCodes:['nmn','ergothioneine'],product_focus:'精细养护组合',last_message:'两种一起了解的话，应该先从哪个开始？',last_time:'刚刚',next_action:'先澄清目标与在用产品，再给分步体验建议',next_at:'立即回复',consent:'企业微信已授权',traits:['愿意持续沟通','关注搭配逻辑','决策前会比较'],facts:['近7天发起咨询3次','阅读专业版内容','已说明暂无特殊用药'],purchase:['NMN体验装 · 2026/06']},
    {id:6,name:'孙先生',phone:'188****3019',city:'广州',owner:'王顾问',member:'普通会员',stage:'待首次触达',priority:'低',assetCodes:['regular','coq10'],product_focus:'辅酶Q10体验装',last_message:'在问卷中选择“偶尔尝试保健品”。',last_time:'昨天',next_action:'用通俗语言介绍，不要求立即购买',next_at:'明天 10:00',consent:'站内服务消息授权',traits:['保健品新手','需要基础解释','低频触达'],facts:['首次完成需求问卷','未产生主动咨询','选择简单易懂内容'],purchase:[]},
    {id:7,name:'郑女士',phone:'186****4428',city:'成都',owner:'李顾问',member:'黄金会员',stage:'暂停触达',priority:'低',assetCodes:['ergothioneine'],product_focus:'麦角硫因单品',last_message:'最近先不要给我发消息，谢谢。',last_time:'5天前',next_action:'遵守暂停要求，30天内不主动触达',next_at:'已暂停',consent:'用户要求暂停',traits:['明确表达边界','偏好自主浏览','当前不可主动触达'],facts:['5天前要求暂停消息','已写入免打扰状态','仅允许响应式服务'],purchase:['麦角硫因体验装 · 2026/01']},
    {id:8,name:'刘先生',phone:'133****9072',city:'武汉',owner:'张顾问',member:'铂金会员',stage:'待跟进',priority:'中',assetCodes:['coq10','nmn'],product_focus:'活力管理组合',last_message:'你把主要区别和适合什么情况发我，我有空看。',last_time:'昨天',next_action:'发送结构化对比，不使用绝对功效表达',next_at:'今天 19:00',consent:'企业微信已授权',traits:['职业节奏快','偏好结构化信息','晚间阅读'],facts:['工作日白天很少回复','对对比表点击率高','曾主动要求文字总结'],purchase:['辅酶Q10基础装 · 2026/05']}
  ];
  const broadPersonas={
    1:{age_band:'45–54岁',gender:'女性',occupation:'企业管理/财务相关岗位（推断）',life_stage:'工作与家庭责任并重',personality:'理性谨慎、重视确定性',decision_style:'先确认风险与长期成本，再做决定',content_preference:'简短结论 + 可核验依据',available_time:'工作日午休或晚间',non_health_topics:['家庭规划','工作效率','品质生活'],intention_score:86,conversion_probability:62,confidence:78,sources:['称呼与用户资料','历史回复时段','内容阅读与咨询行为']},
    2:{age_band:'35–44岁',gender:'男性',occupation:'技术/研发岗位（推断）',life_stage:'职业发展稳定期',personality:'分析型、反感夸张表达',decision_style:'比较参数与证据后决策',content_preference:'专业解释 + 对比表',available_time:'工作日晚间',non_health_topics:['科技趋势','阅读学习','工作方法'],intention_score:72,conversion_probability:48,confidence:74,sources:['专业内容停留','直播提问方式','历史互动用词']},
    3:{age_band:'40–49岁',gender:'女性',occupation:'教育/公共服务岗位（推断）',life_stage:'家庭共同决策阶段',personality:'温和审慎、重视家人意见',decision_style:'先与家人讨论，再确认细节',content_preference:'场景化说明 + 低压力跟进',available_time:'午后或周末',non_health_topics:['家庭教育','亲子生活','节日安排'],intention_score:79,conversion_probability:55,confidence:81,sources:['用户资料','家庭相关提问','回复时间分布']},
    4:{age_band:'45–54岁',gender:'男性',occupation:'个体经营/销售岗位（推断）',life_stage:'时间碎片化、关注投入产出',personality:'务实直接、耐心有限',decision_style:'先看核心价值和价格',content_preference:'单页要点 + 明确价格区间',available_time:'晚间',non_health_topics:['生意经营','本地生活','出行'],intention_score:51,conversion_probability:31,confidence:70,sources:['优惠点击行为','低频回复','晚间互动']},
    5:{age_band:'30–39岁',gender:'女性',occupation:'品牌/设计/自由职业（推断）',life_stage:'品质生活探索期',personality:'开放主动、乐于比较',decision_style:'通过多轮交流逐步筛选',content_preference:'审美友好的分步对比',available_time:'时间较灵活',non_health_topics:['审美设计','旅行','生活方式'],intention_score:91,conversion_probability:71,confidence:83,sources:['连续主动咨询','专业内容阅读','对搭配逻辑的提问']},
    6:{age_band:'25–34岁',gender:'男性',occupation:'制造/工程相关岗位（推断）',life_stage:'初步建立个人消费习惯',personality:'谨慎尝试、需要低门槛',decision_style:'先理解基础，再小步体验',content_preference:'通俗短内容 + 常见问题',available_time:'通勤或晚间',non_health_topics:['数码产品','运动休闲','职业成长'],intention_score:43,conversion_probability:24,confidence:68,sources:['首次问卷','内容模式选择','尚无主动咨询']},
    7:{age_band:'40–49岁',gender:'女性',occupation:'行政/人力相关岗位（推断）',life_stage:'当前关注降低',personality:'边界清晰、偏好自主控制',decision_style:'只在主动需要时了解',content_preference:'不主动推送',available_time:'不可主动触达',non_health_topics:['职场管理','阅读','城市生活'],intention_score:18,conversion_probability:8,confidence:90,sources:['用户明确暂停要求','免打扰记录','历史反馈']},
    8:{age_band:'35–44岁',gender:'男性',occupation:'项目管理/专业服务岗位（推断）',life_stage:'工作节奏快、重视信息效率',personality:'目标导向、偏好结构化',decision_style:'快速比较后择优',content_preference:'表格、清单、文字总结',available_time:'工作日晚间',non_health_topics:['商业资讯','效率工具','差旅出行'],intention_score:76,conversion_probability:52,confidence:79,sources:['用户主动要求对比','阅读时段','内容点击类型']}
  };
  const customers=base.map((c,index)=>{const persona=broadPersonas[c.id];return ({...c,persona,
    assets:c.assetCodes.map(code=>({code,name:categories.find(x=>x.code===code).name,basis:index%2?'内容与咨询事实':'购买与互动事实'})),
    ai_profile:{summary:`${c.name}当前关注${c.product_focus}，沟通上呈现${persona.personality}的特征，${persona.decision_style}。建议围绕“${c.next_action}”展开，并结合其${persona.non_health_topics.slice(0,2).join('、')}等生活话题建立自然沟通。`,tags:[...c.traits,persona.occupation,persona.life_stage],confidence:persona.confidence/100,generated_at:ago(index+1),evidence:c.facts.map((label,i)=>({label,source:i===0?'行为记录':i===1?'互动记录':'用户主动偏好'})),guardrails:c.stage==='暂停触达'?['禁止主动触达','仅响应用户主动咨询']:['不承诺疾病治疗效果','不把推断描述成用户事实','不按政治立场或敏感属性定向沟通','发送前由运营人员确认']},
    interactions:[{type:'客户消息',content:c.last_message,time:c.last_time,channel:'企业微信'},{type:'系统记录',content:c.next_action,time:'待执行',channel:'运营中台'}]
  })});
  const scripts=[
    {id:'opening',scene:'首次触达',title:'从用户行为自然开场',purpose:'建立对话，不直接推产品',template:'您好，看到您之前关注过{{关注内容}}。想先了解一下，您现在更关心成分本身、日常使用，还是如何选择？我可以按您最关心的一点简要说明。',avoid:'不要直接使用“您是高意向客户”等内部判断。'},
    {id:'need',scene:'需求澄清',title:'先问清目标再推荐',purpose:'减少无效推荐',template:'为了避免信息太多，我先确认一下：您更希望解决的是{{目标A}}，还是更关注{{目标B}}？另外现在是否正在使用其他营养产品？',avoid:'不追问疾病隐私；涉及用药时提示咨询医生或药师。'},
    {id:'compare',scene:'产品比较',title:'用事实解释差异',purpose:'帮助用户形成可理解的选择',template:'这两类产品关注点不同，可以从成分定位、使用方式、信息证据和预算四方面比较。我先把主要差异列清楚，再由您判断哪种更符合当前需要。',avoid:'避免“最好、一定有效、人人适合”等表达。'},
    {id:'objection',scene:'异议处理',title:'回应价格与安全顾虑',purpose:'先处理疑虑再推进',template:'您考虑安全和长期成本很正常。我们可以先把不适合的情况、使用边界和单次体验成本说明白，不需要现在就做长期决定。',avoid:'不制造稀缺和焦虑，不用健康风险迫使成交。'},
    {id:'follow',scene:'跟进提醒',title:'低压力继续上次对话',purpose:'保持服务感，避免打扰',template:'您好，上次您提到{{上次问题}}。我把相关要点整理好了，您方便时看即可。如果暂时不需要，我也可以停止后续提醒。',avoid:'尊重免打扰和暂停状态。'},
    {id:'close',scene:'方案确认',title:'确认理解后再推进',purpose:'完成明确、自主的下一步',template:'根据刚才确认的需求，当前更匹配的是{{方案}}。我再把包含内容、使用边界和需要注意的地方发您；您确认理解后，再决定是否继续。',avoid:'不替用户做决定，不隐瞒限制条件。'}
  ];
  const taskCategories=[
    {code:'daily',label:'每日用户触达',icon:'日',description:'新用户与日常服务触达'},
    {code:'intent',label:'意向逐层跟进',icon:'阶',description:'按低、中、高意向推进下一步'},
    {code:'purchase_care',label:'购买后定期关怀',icon:'护',description:'围绕实际使用、节奏与疑问关怀'},
    {code:'birthday',label:'生日关怀',icon:'生',description:'先祝福，再由用户决定是否继续沟通'},
    {code:'public_event',label:'公共事件关怀',icon:'讯',description:'天气、交通、节假日等中性公共信息'},
    {code:'reactivation',label:'沉默用户唤醒',icon:'醒',description:'低压力确认是否仍需要服务'},
    {code:'reply',label:'客户消息回复',icon:'回',description:'优先处理当前客户消息'}
  ];
  let tasks=[
    {id:'t1',customer_id:1,category:'reply',type:'回复客户',funnel:'高意向·顾虑处理',reason:'客户询问长期使用与价格',objective:'获得对安全或预算重点的明确反馈',touch_angle:'先认可谨慎，再让用户选择先谈安全还是预算',prompt:'客户当前关注长期使用负担与价格，希望得到简短、可信的解释。',previous_touch:'昨日发送产品说明，客户8分钟前主动追问',recommended_scene:'objection',optimization_hint:'昨日长段解释开口率偏低，今日控制在80字内并使用二选一问题',due:'今天 10:30',status:'pending'},
    {id:'t2',customer_id:2,category:'daily',type:'首次触达',funnel:'新线索·建立对话',reason:'直播后留下成分差异问题',objective:'完成首次有效开口',touch_angle:'从其专业提问自然开场，不直接推荐产品',prompt:'用户看完直播后关注成分差异，偏好专业和结构化信息。',previous_touch:'昨日未主动触达',recommended_scene:'ice_break',optimization_hint:'采用“最关心成分、证据还是使用方式”三选一开场',due:'今天 11:00',status:'pending'},
    {id:'t3',customer_id:3,category:'intent',type:'意向二次跟进',funnel:'中高意向·家庭确认',reason:'与用户约定两天后联系',objective:'确认家庭决策卡点',touch_angle:'延续约定，询问是否需要一页式家庭沟通说明',prompt:'用户需要与家人商量，今天是双方约定的跟进时间。',previous_touch:'前次回应“先商量，两天后再说”',recommended_scene:'follow',optimization_hint:'昨日约定式跟进回复率高于普通追问12%，保留用户退出选项',due:'今天 14:00',status:'pending'},
    {id:'t4',customer_id:4,category:'reactivation',type:'沉默用户唤醒',funnel:'低意向·已读未回',reason:'连续3天无回复但晚间内容仍有点击',objective:'确认是否继续提供信息',touch_angle:'只发一条独立可读要点，明确可暂停',prompt:'用户偏好晚间阅读和简短摘要，对频繁追问反感。',previous_touch:'3天前回复“收到，我再看看”',recommended_scene:'follow',optimization_hint:'沉默用户不连续追问；使用一句价值信息 + 明确退出选项',due:'今天 20:10',status:'pending'},
    {id:'t5',customer_id:8,category:'intent',type:'发送结构化对比',funnel:'中意向·信息比较',reason:'用户主动要求主要区别文字总结',objective:'帮助用户完成比较并确认下一问题',touch_angle:'使用四点对比清单，适配其项目管理式阅读习惯',prompt:'用户工作节奏快，主动要求产品区别与适用情况的文字总结。',previous_touch:'昨日用户主动提出对比需求',recommended_scene:'consult',optimization_hint:'结构化清单开口率比长文高18%，结尾只保留一个问题',due:'今天 19:00',status:'pending'},
    {id:'t6',customer_id:5,category:'reply',type:'即时回复',funnel:'高意向·方案比较',reason:'当前对话等待回复',objective:'澄清优先目标并给出分步选择',touch_angle:'认可其比较习惯，先问目标再谈搭配',prompt:'用户在比较两类方案，愿意多轮沟通，不需要催促。',previous_touch:'刚刚收到客户问题',recommended_scene:'consult',optimization_hint:'高意向用户减少泛化介绍，直接围绕其问题给下一步',due:'立即',status:'pending'},
    {id:'t7',customer_id:1,category:'purchase_care',type:'第14天使用关怀',funnel:'已购买·使用中',reason:'达到体验周期第14天',objective:'确认实际使用节奏、疑问与是否需要服务',touch_angle:'先问实际感受和执行情况，不预设效果',prompt:'用户已进入第14天体验节点，需要中性询问使用情况和遇到的问题。',previous_touch:'7天前完成一次使用方式确认',recommended_scene:'follow',optimization_hint:'关怀消息避免暗示必然效果，先问“是否按计划使用”',due:'今天 17:30',status:'pending'},
    {id:'t8',customer_id:2,category:'purchase_care',type:'第30天定期关怀',funnel:'已购买·周期复盘',reason:'购买记录进入30天服务节点',objective:'了解实际体验并提供必要说明',touch_angle:'结合其分析型特征，提供三项简短复盘问题',prompt:'用户购买后30天，偏好事实和结构化复盘。',previous_touch:'15天前曾询问使用节奏',recommended_scene:'follow',optimization_hint:'三问式关怀比开放式“感觉如何”回复率高9%',due:'明天 10:20',status:'pending'},
    {id:'t9',customer_id:3,category:'birthday',type:'生日关怀',funnel:'会员服务·非销售优先',reason:'用户生日将在3天后到来',objective:'完成真诚祝福并确认服务偏好',touch_angle:'结合家庭生活话题表达祝福，不在首条消息附产品链接',prompt:'用户生日临近，首要目标是服务关怀，不做强销售。',previous_touch:'去年生日关怀有回复',recommended_scene:'ice_break',optimization_hint:'生日首条纯祝福的开口率显著高于附促销信息的消息',due:'今天 09:40',status:'pending'},
    {id:'t10',customer_id:8,category:'public_event',type:'公共事件关怀',funnel:'服务关系·中性关怀',reason:'所在地出现公开天气/交通预警（演示）',objective:'确认出行是否受影响，不绑定产品销售',touch_angle:'根据其差旅特征发送简短出行提醒',prompt:'仅基于公开天气或交通信息进行中性问候，不讨论政治立场，不附营销信息。',previous_touch:'近30天无公共事件类关怀',recommended_scene:'ice_break',optimization_hint:'公共事件触达只在信息与所在地匹配且授权有效时执行',due:'今天 08:50',status:'pending'},
    {id:'t11',customer_id:6,category:'daily',type:'新用户基础触达',funnel:'低意向·初步了解',reason:'首次问卷完成后24小时',objective:'让用户选一个最容易回答的问题',touch_angle:'跳出产品介绍，从日常节奏与信息偏好切入',prompt:'用户是保健品新手，但可从通勤、运动休闲或工作节奏等一般生活场景自然开口。',previous_touch:'尚未进行人工触达',recommended_scene:'ice_break',optimization_hint:'低意向新客使用生活场景问题，不直接问购买计划',due:'明天 18:30',status:'pending'}
  ];
  let optimizationVersion=3;
  const performance=()=>({date_label:'昨日',metrics:{assigned:128,completed:116,opening_rate:63.8,reply_rate:37.1,intent_rate:24.6,conversion_rate:9.3,care_positive_rate:71.4},deltas:{opening_rate:4.6,reply_rate:2.1,intent_rate:1.8,conversion_rate:-0.7},by_category:[{label:'客户消息回复',opening_rate:92.4,intent_rate:48.2,conversion_rate:18.6},{label:'意向逐层跟进',opening_rate:71.3,intent_rate:35.8,conversion_rate:13.4},{label:'购买后定期关怀',opening_rate:76.9,intent_rate:20.1,conversion_rate:7.2},{label:'生日关怀',opening_rate:84.6,intent_rate:12.5,conversion_rate:4.1},{label:'沉默用户唤醒',opening_rate:31.8,intent_rate:8.7,conversion_rate:2.6}],optimization:{version:`D+1 V${optimizationVersion}`,generated_at:now(),winners:['带约定时间的跟进回复率高于普通追问12%','结构化清单开口率比长文高18%','生日首条纯祝福比附促销信息更容易获得回复'],adjustments:['价格顾虑场景减少长段解释，改用二选一问题','沉默用户每次只发一条独立信息，并提供暂停选项','购买关怀不预设效果，围绕实际执行和疑问提问'],today_focus:'优先处理主动消息与约定跟进；低意向用户从生活节奏、职业场景和内容偏好自然开口。',next_review:'今日 18:30 自动复盘'}});
  let loggedIn=false,sequence=100;
  const conversations=new Map(customers.map(c=>[c.id,{id:c.id,customer_id:c.id,scene:'consult',messages:[{role:'operator',content:`您好${c.name.slice(0,1)}老师，上次关注的内容还有哪里需要我说明吗？`,time:'前次沟通'},{role:'customer',content:c.last_message,time:c.last_time}],suggestion:null}]));
  const ok=(data,status=200)=>Promise.resolve(new Response(JSON.stringify({success:true,data,error:null,request_id:'operator-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const fail=(message,status=404)=>Promise.resolve(new Response(JSON.stringify({success:false,data:null,error:{message},request_id:'operator-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const body=options=>{try{return JSON.parse(options?.body||'{}')}catch{return {}}};
  const customer=id=>customers.find(x=>x.id===Number(id));
  function suggestionFor(c,message,scene,task){
    const sensitive=/治疗|治好|药|医生|怀孕|孕期|严重|胸痛|呼吸困难/.test(message);
    const taskReply=task?.category==='birthday'
      ?`${c.name.slice(0,1)}老师您好，提前祝您生日快乐！希望接下来这一年工作和生活都顺心。今天先送上祝福，不打扰您；如果之后有任何需要我协助整理的信息，随时告诉我就好。`
      :task?.category==='public_event'
        ?`${c.name.slice(0,1)}老师您好，看到您所在地区近期有天气或交通提醒，想问候一下，出行请多留意安全。如果现在不方便回复也没关系，这条消息只作关怀提醒。`
        :task?.category==='purchase_care'
          ?`${c.name.slice(0,1)}老师您好，到了我们之前约定的使用关怀时间。想简单确认三点：目前是否按计划使用、有没有不清楚的地方、接下来的节奏是否需要调整？我先了解实际情况，不预设任何效果。`
          :task?.category==='reactivation'
            ?`${c.name.slice(0,1)}老师您好，上次的信息您可以按自己的时间查看。我只补充一条最关键的要点：${c.product_focus}需要先确认适用边界和实际需求。如果暂时不需要，我就停止后续提醒。`
            :task?.category==='daily'
              ?`${c.name.slice(0,1)}老师您好，看到您之前关注过相关内容。为了不一次发太多，我想先问一个容易回答的问题：您现在更想了解基本区别、日常怎么选，还是只先看看注意事项？`
              :null;
    const reply=sensitive
      ?`您提到的情况涉及专业医疗判断，我不能仅根据产品信息给出结论。建议先咨询医生或药师；如果您愿意，我可以只把${c.product_focus}的公开成分信息和注意事项整理给您参考。`
      :taskReply
        ?taskReply
        :scene==='objection'
        ?`您会考虑安全和长期成本很正常。针对${c.product_focus}，我可以先把适用边界、体验周期和不同选择说明白，不需要现在就做长期决定。您更想先了解安全注意，还是预算安排？`
        :scene==='follow'
          ?`您好，上次您提到“${c.last_message.slice(0,28)}”。我把与${c.product_focus}相关的要点整理好了，您方便时看即可；如果暂时不需要，我就不继续打扰。`
          :`理解您的关注。结合您刚刚提到的情况，我们可以先围绕${c.product_focus}把使用边界、产品差异和预算逐项说明。您现在最想先确认哪一点？`;
    return {reply,alternatives:[`我先把${c.product_focus}最需要注意的三点发您，您看完再决定要不要继续了解。`,`可以先从${c.persona.non_health_topics[0]}或日常节奏聊起，再看您是否需要继续了解相关方案。`],reason:`基于当前消息、${c.product_focus}关注事实、${c.persona.decision_style}的沟通判断${task?`及“${task.type}”任务`:''}生成`,policy_flags:sensitive?['触发医疗边界','禁止个体化用药建议','需要人工确认']:['不使用绝对功效','不把推断当事实','不涉及政治立场定向','不暴露内部信息','发送前人工确认'],provider:'Dotbest Reply Agent'};
  }
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);const path=url.pathname.replace(/^\/[^/]+(?=\/api\/)/,'');const method=(options.method||'GET').toUpperCase();
    if(path==='/api/login'&&method==='POST'){loggedIn=true;return ok({display_name:'周顾问',role:'一线运营'})}
    if(path==='/api/logout'&&method==='POST'){loggedIn=false;return ok({})}
    if(path==='/api/me')return loggedIn?ok({id:1,display_name:'周顾问',role:'一线运营',permissions:['customer:read','conversation:reply','task:update']}):fail('请先登录',401);
    if(!loggedIn)return fail('请先登录',401);
    if(path==='/api/v1/private/workbench')return ok({metrics:{due:tasks.filter(x=>x.status==='pending').length,waiting:customers.filter(x=>x.stage==='待回复'||x.stage==='对话中').length,followups:customers.filter(x=>x.stage==='待跟进').length,paused:customers.filter(x=>x.stage==='暂停触达').length},categories,queue:tasks.filter(x=>x.status==='pending').slice(0,6).map(t=>({...t,customer:customer(t.customer_id)})),completed_today:3});
    if(path==='/api/v1/private/user-assets')return ok({categories,updated_at:now()});
    let m=path.match(/^\/api\/v1\/private\/user-assets\/([\w-]+)\/customers$/);
    if(m){const audience=categories.find(x=>x.code===m[1]);if(!audience)return fail('人群不存在');const q=(url.searchParams.get('q')||'').toLowerCase();let items=customers.filter(x=>x.assetCodes.includes(m[1]));if(q)items=items.filter(x=>`${x.name}${x.phone}${x.owner}${x.product_focus}${x.stage}`.toLowerCase().includes(q));return ok({audience,items,pagination:{page:1,total:items.length}})}
    m=path.match(/^\/api\/v1\/private\/customers\/(\d+)$/);if(m){const c=customer(m[1]);return c?ok(c):fail('用户不存在')}
    m=path.match(/^\/api\/v1\/private\/customers\/(\d+)\/ai-profile\/refresh$/);if(m&&method==='POST'){const c=customer(m[1]);c.ai_profile.generated_at=now();return ok(c.ai_profile)}
    if(path==='/api/v1/private/conversations')return ok({items:customers.filter(x=>x.stage!=='暂停触达').map(c=>({conversation_id:c.id,customer_id:c.id,name:c.name,stage:c.stage,product_focus:c.product_focus,last_message:c.last_message,last_time:c.last_time,priority:c.priority,unread:c.stage==='待回复'||c.stage==='对话中'}))});
    m=path.match(/^\/api\/v1\/private\/customers\/(\d+)\/agent-conversations$/);if(m&&method==='POST'){const c=customer(m[1]);if(!c)return fail('用户不存在');return ok(conversations.get(c.id),201)}
    m=path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)$/);if(m){const conv=conversations.get(Number(m[1]));return conv?ok({conversation:conv,customer:customer(conv.customer_id)}):fail('会话不存在')}
    m=path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)\/messages$/);if(m&&method==='POST'){const conv=conversations.get(Number(m[1]));if(!conv)return fail('会话不存在');const data=body(options),c=customer(conv.customer_id),task=tasks.find(x=>x.id===data.task_id);conv.scene=data.scene||task?.recommended_scene||'consult';conv.messages.push({role:data.task_id?'system_task':'customer',content:String(data.message||task?.prompt||''),time:'刚刚'});conv.suggestion=suggestionFor(c,String(data.message||task?.prompt||''),conv.scene,task);if(!data.task_id){c.last_message=String(data.message||'');c.last_time='刚刚';c.stage='待回复'}return ok({conversation_id:conv.id,suggestion:conv.suggestion,task})}
    m=path.match(/^\/api\/v1\/private\/agent-conversations\/(\d+)\/mark-sent$/);if(m&&method==='POST'){const conv=conversations.get(Number(m[1]));if(!conv)return fail('会话不存在');const data=body(options);conv.messages.push({role:'operator',content:String(data.reply||''),time:'刚刚'});conv.suggestion=null;const c=customer(conv.customer_id),task=tasks.find(x=>x.id===data.task_id);if(task)task.status='done';c.stage='待跟进';c.next_action='等待用户回复，避免重复触达';c.next_at='2天后';return ok({sent:true,conversation:conv,task_completed:Boolean(task)})}
    if(path==='/api/v1/private/tasks'&&method==='GET'){const category=url.searchParams.get('category')||'all';const filtered=tasks.filter(t=>category==='all'||t.category===category);return ok({items:filtered.map(t=>({...t,customer:customer(t.customer_id)})),all_items:tasks.map(t=>({...t,customer:customer(t.customer_id)})),pending:tasks.filter(x=>x.status==='pending').length,categories:taskCategories,performance:performance()})}
    if(path==='/api/v1/private/tasks/optimization/refresh'&&method==='POST'){optimizationVersion+=1;return ok(performance().optimization)}
    m=path.match(/^\/api\/v1\/private\/tasks\/([\w-]+)$/);if(m&&method==='GET'){const t=tasks.find(x=>x.id===m[1]);return t?ok({...t,customer:customer(t.customer_id),performance:performance()}):fail('任务不存在')}
    m=path.match(/^\/api\/v1\/private\/tasks\/([\w-]+)\/status$/);if(m&&method==='POST'){const t=tasks.find(x=>x.id===m[1]);if(!t)return fail('任务不存在');t.status=body(options).status||'done';return ok(t)}
    if(path==='/api/v1/private/scripts')return ok({items:scripts,scenes:[...new Set(scripts.map(x=>x.scene))]});
    if(path==='/api/v1/private/governance')return ok({role:'一线运营',allowed:['查看本人负责用户的脱敏资料','查看内部辅助摘要及事实依据','生成、编辑和复制回复建议','更新本人触达任务与跟进记录'],blocked:['访问后台订单管理','查看经营决策与利润报表','导出完整手机号等敏感字段','将内部标签、评分或推断直接发送给客户'],audit:[{time:'今天 09:18',action:'生成回复建议',object:'林女士',result:'通过合规检查'},{time:'昨天 17:42',action:'暂停触达',object:'郑女士',result:'已写入免打扰'}]});
    return fail('演示接口不存在');
  };
})();
