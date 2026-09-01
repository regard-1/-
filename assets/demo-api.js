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
    {id:1,name:'示例用户01',phone:'000****0001',city:'华东地区',owner:'演示顾问A',member:'示例会员A',stage:'待回复',priority:'高',assetCodes:['nmn','coq10'],product_focus:'NMN焕活方案',last_message:'我担心长期吃会不会负担大，而且价格也要考虑。',last_time:'8分钟前',next_action:'先回应安全与周期顾虑，再给轻量体验选择',next_at:'今天 10:30',consent:'演示渠道已授权',traits:['重视安全边界','倾向简单方案','价格需解释价值'],facts:['示例浏览行为A','示例咨询行为A','示例沟通偏好A'],purchase:['NMN体验装 · 示例记录A','辅酶Q10基础装 · 示例记录B']},
    {id:2,name:'示例用户02',phone:'000****0002',city:'华东地区',owner:'演示顾问A',member:'示例会员B',stage:'待首次触达',priority:'中',assetCodes:['ergothioneine','regular'],product_focus:'麦角硫因体验方案',last_message:'在直播间问过麦角硫因和普通抗氧化产品有什么区别。',last_time:'昨天',next_action:'从成分差异切入，邀请其说明最关心的使用目标',next_at:'今天 11:00',consent:'演示渠道可触达',traits:['成分知识较深','重视证据来源','不喜欢强推'],facts:['示例浏览行为B','示例收藏行为B','示例沟通偏好B'],purchase:['日常营养组合 · 示例记录C']},
    {id:3,name:'示例用户03',phone:'000****0003',city:'华东地区',owner:'演示顾问B',member:'示例会员C',stage:'待跟进',priority:'高',assetCodes:['coq10','regular'],product_focus:'辅酶Q10日常方案',last_message:'我先和家里人商量一下，过两天再说。',last_time:'2天前',next_action:'轻量确认家庭使用场景，不制造紧迫感',next_at:'今天 14:00',consent:'演示渠道已授权',traits:['家庭决策型','需要低压力沟通','关注日常坚持'],facts:['示例咨询行为C','示例回复时段C','示例内容偏好C'],purchase:['基础维矿组合 · 示例记录D']},
    {id:4,name:'示例用户04',phone:'000****0004',city:'华东地区',owner:'演示顾问C',member:'示例会员D',stage:'已读未回',priority:'中',assetCodes:['regular','nmn'],product_focus:'日常营养组合',last_message:'收到，我再看看。',last_time:'3天前',next_action:'发送一条可独立阅读的要点，不连续追问',next_at:'今天 16:30',consent:'演示渠道可触达',traits:['回复频率低','偏好图文摘要','价格敏感'],facts:['示例点击行为D','示例咨询行为D','示例回复时段D'],purchase:['益生菌体验装 · 示例记录E']},
    {id:5,name:'示例用户05',phone:'000****0005',city:'华北地区',owner:'演示顾问A',member:'示例会员B',stage:'对话中',priority:'高',assetCodes:['nmn','ergothioneine'],product_focus:'精细养护组合',last_message:'两种一起了解的话，应该先从哪个开始？',last_time:'刚刚',next_action:'先澄清目标与在用产品，再给分步体验建议',next_at:'立即回复',consent:'演示渠道已授权',traits:['愿意持续沟通','关注搭配逻辑','决策前会比较'],facts:['示例咨询行为E','示例阅读行为E','示例自述信息E'],purchase:['NMN体验装 · 示例记录F']},
    {id:6,name:'示例用户06',phone:'000****0006',city:'华南地区',owner:'演示顾问D',member:'示例会员E',stage:'待首次触达',priority:'低',assetCodes:['regular','coq10'],product_focus:'辅酶Q10体验装',last_message:'在问卷中选择“偶尔尝试保健品”。',last_time:'昨天',next_action:'用通俗语言介绍，不要求立即购买',next_at:'明天 10:00',consent:'演示渠道已授权',traits:['保健品新手','需要基础解释','低频触达'],facts:['示例问卷行为F','示例咨询状态F','示例内容偏好F'],purchase:[]},
    {id:7,name:'示例用户07',phone:'000****0007',city:'西南地区',owner:'演示顾问B',member:'示例会员C',stage:'暂停触达',priority:'低',assetCodes:['ergothioneine'],product_focus:'麦角硫因单品',last_message:'最近先不要给我发消息，谢谢。',last_time:'5天前',next_action:'遵守暂停要求，30天内不主动触达',next_at:'已暂停',consent:'用户要求暂停',traits:['明确表达边界','偏好自主浏览','当前不可主动触达'],facts:['示例暂停记录G','示例免打扰记录G','示例授权边界G'],purchase:['麦角硫因体验装 · 示例记录G']},
    {id:8,name:'示例用户08',phone:'000****0008',city:'华中地区',owner:'演示顾问C',member:'示例会员B',stage:'待跟进',priority:'中',assetCodes:['coq10','nmn'],product_focus:'活力管理组合',last_message:'你把主要区别和适合什么情况发我，我有空看。',last_time:'昨天',next_action:'发送结构化对比，不使用绝对功效表达',next_at:'今天 19:00',consent:'演示渠道已授权',traits:['职业节奏快','偏好结构化信息','晚间阅读'],facts:['示例回复时段H','示例内容偏好H','示例咨询行为H'],purchase:['辅酶Q10基础装 · 示例记录H']}
  ];
  const broadPersonas={
    1:{age_band:'示例年龄段A',gender:'未标注',occupation:'示例职业类型A（推断）',life_stage:'示例生活阶段A',personality:'理性谨慎、重视确定性',decision_style:'先确认风险与长期成本，再做决定',content_preference:'简短结论 + 可核验依据',available_time:'示例时段A',non_health_topics:['示例话题A','示例话题B'],intention_score:86,conversion_probability:62,confidence:78,sources:['脱敏用户资料','模拟回复时段','模拟内容行为']},
    2:{age_band:'示例年龄段B',gender:'未标注',occupation:'示例职业类型B（推断）',life_stage:'示例生活阶段B',personality:'分析型、反感夸张表达',decision_style:'比较参数与证据后决策',content_preference:'专业解释 + 对比表',available_time:'示例时段B',non_health_topics:['示例话题C','示例话题D'],intention_score:72,conversion_probability:48,confidence:74,sources:['模拟内容行为','模拟提问方式','模拟互动用词']},
    3:{age_band:'示例年龄段C',gender:'未标注',occupation:'示例职业类型C（推断）',life_stage:'示例生活阶段C',personality:'温和审慎、重视家人意见',decision_style:'先与家人讨论，再确认细节',content_preference:'场景化说明 + 低压力跟进',available_time:'示例时段C',non_health_topics:['示例话题E','示例话题F'],intention_score:79,conversion_probability:55,confidence:81,sources:['脱敏用户资料','模拟提问行为','模拟回复分布']},
    4:{age_band:'示例年龄段D',gender:'未标注',occupation:'示例职业类型D（推断）',life_stage:'示例生活阶段D',personality:'务实直接、耐心有限',decision_style:'先看核心价值和价格',content_preference:'单页要点 + 明确价格区间',available_time:'示例时段D',non_health_topics:['示例话题G','示例话题H'],intention_score:51,conversion_probability:31,confidence:70,sources:['模拟点击行为','模拟回复频率','模拟互动时段']},
    5:{age_band:'示例年龄段E',gender:'未标注',occupation:'示例职业类型E（推断）',life_stage:'示例生活阶段E',personality:'开放主动、乐于比较',decision_style:'通过多轮交流逐步筛选',content_preference:'审美友好的分步对比',available_time:'示例时段E',non_health_topics:['示例话题I','示例话题J'],intention_score:91,conversion_probability:71,confidence:83,sources:['模拟咨询行为','模拟阅读行为','模拟提问方式']},
    6:{age_band:'示例年龄段F',gender:'未标注',occupation:'示例职业类型F（推断）',life_stage:'示例生活阶段F',personality:'谨慎尝试、需要低门槛',decision_style:'先理解基础，再小步体验',content_preference:'通俗短内容 + 常见问题',available_time:'示例时段F',non_health_topics:['示例话题K','示例话题L'],intention_score:43,conversion_probability:24,confidence:68,sources:['模拟问卷','模拟内容选择','模拟咨询状态']},
    7:{age_band:'示例年龄段G',gender:'未标注',occupation:'示例职业类型G（推断）',life_stage:'示例生活阶段G',personality:'边界清晰、偏好自主控制',decision_style:'只在主动需要时了解',content_preference:'不主动推送',available_time:'不可主动触达',non_health_topics:['示例话题M','示例话题N'],intention_score:18,conversion_probability:8,confidence:90,sources:['模拟暂停要求','模拟免打扰记录','模拟历史反馈']},
    8:{age_band:'示例年龄段H',gender:'未标注',occupation:'示例职业类型H（推断）',life_stage:'示例生活阶段H',personality:'目标导向、偏好结构化',decision_style:'快速比较后择优',content_preference:'表格、清单、文字总结',available_time:'示例时段H',non_health_topics:['示例话题O','示例话题P'],intention_score:76,conversion_probability:52,confidence:79,sources:['模拟对比需求','模拟阅读时段','模拟点击类型']}
  };
  const customers=base.map((c,index)=>{const persona=broadPersonas[c.id];return ({...c,persona,
    assets:c.assetCodes.map(code=>({code,name:categories.find(x=>x.code===code).name,basis:index%2?'内容与咨询事实':'购买与互动事实'})),
    ai_profile:{summary:`${c.name}当前关注${c.product_focus}，沟通上呈现${persona.personality}的特征，${persona.decision_style}。建议围绕“${c.next_action}”展开，并结合其${persona.non_health_topics.slice(0,2).join('、')}等生活话题建立自然沟通。`,tags:[...c.traits,persona.occupation,persona.life_stage],confidence:persona.confidence/100,generated_at:ago(index+1),evidence:c.facts.map((label,i)=>({label,source:i===0?'行为记录':i===1?'互动记录':'用户主动偏好'})),guardrails:c.stage==='暂停触达'?['禁止主动触达','仅响应用户主动咨询']:['不承诺疾病治疗效果','不把推断描述成用户事实','不按政治立场或敏感属性定向沟通','发送前由运营人员确认']},
    interactions:[{type:'客户消息',content:c.last_message,time:c.last_time,channel:'企业微信'},{type:'系统记录',content:c.next_action,time:'待执行',channel:'运营中台'}]
  })});
  const scripts=[
    {id:'new-icebreak',customer_type:'新客',stage:'触达激活',scene:'破冰建联',title:'接住来源，只问一个问题',purpose:'让用户愿意开口',template:'{{称呼}}，我是之前在{{来源场景}}和您联系过的{{顾问名}}。看到您当时留意了{{内容}}，我先不发一大段介绍——您现在是想简单了解一下，还是已经有具体问题？',next_turn:'用户回复后复述其原话，再采集一个必要标签。',avoid:'不使用空泛“亲，在吗”；不在首条塞价格、链接和多个卖点。'},
    {id:'new-tag',customer_type:'新客',stage:'触达激活',scene:'标签采集',title:'用选择题了解需求',purpose:'完成低压力标签采集',template:'明白。那我只确认一个方向：您现在更在意{{方向A}}，还是{{方向B}}？我按您选的方向说，省得信息太多。',next_turn:'记录用户自述标签；不要把系统推断当成答案。',avoid:'一次只问一个问题，不连续盘问年龄、职业、疾病史。'},
    {id:'new-discovery',customer_type:'新客',stage:'需求转化',scene:'挖需',title:'承接用户原话继续问',purpose:'找到真实使用场景',template:'您刚才说“{{用户原话}}”，我理解您主要卡在{{已确认问题}}。这个情况大概持续多久了？我先把场景弄清楚，再看有没有必要继续了解。',next_turn:'追问使用场景、既往体验或预算中的一项。',avoid:'不替用户定义需求；不从普通困扰推断疾病。'},
    {id:'new-education',customer_type:'新客',stage:'需求转化',scene:'教育说明',title:'先给结论，再问是否展开',purpose:'降低理解成本',template:'先说简单结论：{{一句话结论}}。它主要解决的是{{作用边界}}，并不等于{{常见误解}}。如果您愿意，我再把依据和注意事项用三点发您。',next_turn:'用户同意后再发送三点说明，不一次性倾倒全部资料。',avoid:'不承诺治疗、逆转、必然有效；不使用无法核验的倍数话术。'},
    {id:'new-compare',customer_type:'新客',stage:'需求转化',scene:'产品对比',title:'按用户在意点做对比',purpose:'帮助用户自主选择',template:'按您最在意的{{比较维度}}看：A更偏{{A特点}}，B更偏{{B特点}}；使用方式和预算分别是{{简要差异}}。如果只先选一个，您更倾向哪种节奏？',next_turn:'根据选择进入顾虑处理，不立刻追加促销。',avoid:'不贬低竞品，不用“最好、顶级、人人适合”。'},
    {id:'new-close',customer_type:'新客',stage:'需求转化',scene:'轻量促单',title:'总结共识后给小步选择',purpose:'把意向变成明确下一步',template:'按咱们刚确认的{{需求}}，先从{{轻量方案}}更稳妥。包含{{内容}}，需要注意{{边界}}。您想先看具体明细，还是今天先考虑一下？',next_turn:'用户选择看明细后再发送价格/链接；选择考虑则约定时间。',avoid:'不虚构库存、截止时间或替用户锁单。'},
    {id:'new-order-confirm',customer_type:'新客',stage:'成交转化',scene:'信息确认',title:'确认信息，不制造催促',purpose:'减少沟通差错',template:'我把刚才确认的内容再对一遍：{{方案与数量}}，{{权益或注意项}}。您看有没有哪一项需要改？确认无误后我再发下一步。',next_turn:'仅执行沟通确认；不在中台承载后台订单决策。',avoid:'不在聊天里暴露完整地址、证件或内部订单信息。'},
    {id:'new-payment',customer_type:'新客',stage:'成交转化',scene:'支付跟进',title:'先排查卡点',purpose:'帮助用户完成自主操作',template:'刚才那一步如果没走完，可能是页面或支付方式卡住了。您看到的是“不会操作”、 “页面没找到”，还是“还想再考虑”？告诉我哪一种，我只帮您处理那一步。',next_turn:'按操作困难、信任顾虑、仍在考虑分别回复。',avoid:'不默认用户嫌贵；不连续催付。'},
    {id:'new-logistics',customer_type:'新客',stage:'成交转化',scene:'物流通知',title:'简短告知并留下服务入口',purpose:'完成交付沟通',template:'{{称呼}}，给您同步一下：{{包裹状态}}。您收到后先别急着一起用，拍一下外包装或把到货情况告诉我，我再按您这次的内容逐项说明。',next_turn:'到货后转入服用指导。',avoid:'不把物流消息夹带复购促销。'},
    {id:'new-usage',customer_type:'新客',stage:'售后复购',scene:'服用指导',title:'结合实际内容给一步指导',purpose:'帮助正确开始使用',template:'{{称呼}}，您这次收到的是{{产品}}。先记一个最重要的点：{{核心用法}}。您准备从今天开始，还是明天开始？我按您的时间提醒一次就好。',next_turn:'记录开始日期，设置一次关怀节点。',avoid:'不一次发送冗长说明；涉及用药或特殊人群先提示专业咨询。'},
    {id:'new-effect',customer_type:'新客',stage:'售后复购',scene:'效果追踪',title:'问实际情况，不暗示效果',purpose:'了解执行和体验',template:'上次您说从{{开始日期}}开始用，我来问一句：最近是基本按计划在用，还是中间有几天忘了？有不舒服或不清楚的地方也直接告诉我。',next_turn:'先处理执行或疑问，再讨论周期。',avoid:'不问“效果是不是特别好”；不把主观感受包装成疗效。'},
    {id:'new-repurchase',customer_type:'新客',stage:'售后复购',scene:'周期复购/增购',title:'从库存和真实需求判断',purpose:'自然进入复购或增购',template:'按上次的时间算，手上应该快到{{剩余周期}}了。您实际还剩多少？如果还够用就先不急；如果快接不上，我再按原方案和调整方案各算一版。',next_turn:'有需要才提供方案，先问库存再谈活动。',avoid:'不先发促销长图，不用虚假断档焦虑。'},
    {id:'new-referral',customer_type:'新客',stage:'相关裂变',scene:'转介绍邀请',title:'基于满意反馈征得同意',purpose:'自然发起转介绍',template:'您刚才这句反馈我挺开心的，谢谢愿意告诉我。如果身边刚好有人也在了解{{主题}}，您愿意的话可以把我推给他；不方便也完全没关系。',next_turn:'用户同意后再介绍真实权益和参与方式。',avoid:'不让用户群发，不用人情压力换转介绍。'},
    {id:'old-wakeup',customer_type:'存量老客',stage:'沉睡唤醒',scene:'沉睡唤醒',title:'带着记忆回来，不假装熟络',purpose:'确认服务是否仍有价值',template:'{{称呼}}，前阵子您提过{{历史事实}}，我刚整理记录时看到，想问一句：这件事后来解决了吗？如果暂时不需要，我就不继续提醒。',next_turn:'有回复则进入关怀或需求确认；无回复则降低频次。',avoid:'不以“好久没买”开场，不直接发活动。'},
    {id:'old-care',customer_type:'存量老客',stage:'用户关怀',scene:'定期维护',title:'从已知生活节奏自然关怀',purpose:'维持真实关系',template:'{{称呼}}，上次您说{{具体生活/使用情境}}，最近这段时间还顺利吗？我就是顺手问一句，不急着回复。',next_turn:'先聊用户回应的内容，不立即转产品。',avoid:'不使用无法确认的职业、年龄或性格推断作为开场事实。'},
    {id:'old-repurchase',customer_type:'存量老客',stage:'复购增购',scene:'复购增购',title:'先核对库存与变化',purpose:'识别真实复购时点',template:'上次是{{时间}}给您做的{{方案}}，现在家里大概还剩多少？最近需求有没有变化？我先按实际情况判断要不要续，不一定非得照原来买。',next_turn:'确认库存、需求变化后再给原方案/调整方案。',avoid:'不把历史购买直接等同于当前意向。'},
    {id:'old-maintain',customer_type:'存量老客',stage:'定期维护',scene:'节点维护',title:'一次联系只做一件事',purpose:'形成可持续关系节奏',template:'{{称呼}}，今天只来确认一件事：{{明确事项}}。您回我“正常 / 有问题 / 暂停”都可以，我按您的情况处理。',next_turn:'根据三类回复进入服务、答疑或免打扰。',avoid:'不把关怀、调查、促销和裂变塞在同一条消息里。'},
    {id:'old-referral',customer_type:'存量老客',stage:'裂变转介',scene:'权益维护',title:'先感谢，再透明说明权益',purpose:'维护转介关系',template:'谢谢您愿意介绍朋友给我。权益我先说清楚：您这边是{{老客权益}}，朋友是{{新客权益}}，没有隐藏条件。需要我整理一段您方便转发的简短说明吗？',next_turn:'只在用户确认后提供可转发内容。',avoid:'不夸大权益，不泄露被推荐人的购买或咨询信息。'}
  ];
  const historicalLearning={
    source:'脱敏历史触达样本（演示）',scope:'完全模拟的触达汇总，仅用于演示生成规则，不代表真实用户或经营结果',
    totals:{records:120,touches:12000,replies:720,reply_rate:6,conversions:54,reply_to_conversion:7.5,intents:180,deletes:36},
    evidence:[
      {type:'有效信号',title:'具体来由 + 单一低门槛问题',metric:'200触达 / 24回复 / 5成交',rate:'回复率 12%',note:'模拟样本显示单一问题更容易开启对话；数据仅供功能演示。'},
      {type:'有效信号',title:'先问真实使用情况',metric:'240触达 / 18回复',rate:'回复率 7.5%',note:'模拟样本显示使用回访比多轮硬促销更像延续服务。'},
      {type:'有效信号',title:'基于历史记录的个别跟进',metric:'80触达 / 12回复 / 3成交',rate:'回复率 15%',note:'模拟样本显示上下文越具体，越容易形成真实对话。'},
      {type:'风险信号',title:'全量长清单 + 多卖点促销',metric:'800触达 / 12回复',rate:'回复率 1.5%',note:'模拟样本用于展示内容过长时的打扰风险。'},
      {type:'风险信号',title:'稀缺催促式群发',metric:'600触达 / 0回复',rate:'回复率 0%',note:'模拟样本用于展示虚假紧迫感的沟通风险。'}
    ],
    rules:['一句话只承担一个沟通目标','先承接已知事实，再问一个容易回答的问题','用户回复后复述关键词，再进入下一回合','促销、链接和产品长介绍延后到用户明确愿意了解之后','称呼来自真实偏好，不默认使用“亲、姐、哥”','最多使用一个自然表情，专业或谨慎型用户默认不用','不虚构库存、优惠、历史效果或客户关系']
  };
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
    {id:'t3',customer_id:3,category:'intent',type:'意向二次跟进',funnel:'中高意向·家庭确认',reason:'与用户约定两天后联系',objective:'确认家庭决策卡点',touch_angle:'延续约定，询问是否需要一页式家庭沟通说明',prompt:'用户需要与家人商量，今天是双方约定的跟进时间。',previous_touch:'前次回应“先商量，两天后再说”',recommended_scene:'follow',optimization_hint:'承接双方约定和用户原话，只确认一个卡点，并保留退出选项',due:'今天 14:00',status:'pending'},
    {id:'t4',customer_id:4,category:'reactivation',type:'沉默用户唤醒',funnel:'低意向·已读未回',reason:'连续3天无回复但晚间内容仍有点击',objective:'确认是否继续提供信息',touch_angle:'只发一条独立可读要点，明确可暂停',prompt:'用户偏好晚间阅读和简短摘要，对频繁追问反感。',previous_touch:'3天前回复“收到，我再看看”',recommended_scene:'follow',optimization_hint:'沉默用户不连续追问；使用一句价值信息 + 明确退出选项',due:'今天 20:10',status:'pending'},
    {id:'t5',customer_id:8,category:'intent',type:'发送结构化对比',funnel:'中意向·信息比较',reason:'用户主动要求主要区别文字总结',objective:'帮助用户完成比较并确认下一问题',touch_angle:'使用四点对比清单，适配其项目管理式阅读习惯',prompt:'用户工作节奏快，主动要求产品区别与适用情况的文字总结。',previous_touch:'昨日用户主动提出对比需求',recommended_scene:'consult',optimization_hint:'历史长清单群发开口率较低；本次只围绕用户主动要求的维度比较，结尾保留一个问题',due:'今天 19:00',status:'pending'},
    {id:'t6',customer_id:5,category:'reply',type:'即时回复',funnel:'高意向·方案比较',reason:'当前对话等待回复',objective:'澄清优先目标并给出分步选择',touch_angle:'认可其比较习惯，先问目标再谈搭配',prompt:'用户在比较两类方案，愿意多轮沟通，不需要催促。',previous_touch:'刚刚收到客户问题',recommended_scene:'consult',optimization_hint:'高意向用户减少泛化介绍，直接围绕其问题给下一步',due:'立即',status:'pending'},
    {id:'t7',customer_id:1,category:'purchase_care',type:'第14天使用关怀',funnel:'已购买·使用中',reason:'达到体验周期第14天',objective:'确认实际使用节奏、疑问与是否需要服务',touch_angle:'先问实际感受和执行情况，不预设效果',prompt:'用户已进入第14天体验节点，需要中性询问使用情况和遇到的问题。',previous_touch:'7天前完成一次使用方式确认',recommended_scene:'follow',optimization_hint:'关怀消息避免暗示必然效果，先问“是否按计划使用”',due:'今天 17:30',status:'pending'},
    {id:'t8',customer_id:2,category:'purchase_care',type:'第30天定期关怀',funnel:'已购买·周期复盘',reason:'购买记录进入30天服务节点',objective:'了解实际体验并提供必要说明',touch_angle:'结合其分析型特征，先问执行情况，再按回复复盘',prompt:'用户购买后30天，偏好事实和结构化复盘。',previous_touch:'15天前曾询问使用节奏',recommended_scene:'follow',optimization_hint:'历史使用回访样本比多卖点群发更容易形成回复；本轮先只问是否按计划使用',due:'明天 10:20',status:'pending'},
    {id:'t9',customer_id:3,category:'birthday',type:'生日关怀',funnel:'会员服务·非销售优先',reason:'用户生日将在3天后到来',objective:'完成真诚祝福并确认服务偏好',touch_angle:'结合家庭生活话题表达祝福，不在首条消息附产品链接',prompt:'用户生日临近，首要目标是服务关怀，不做强销售。',previous_touch:'去年生日关怀有回复',recommended_scene:'ice_break',optimization_hint:'历史表未提供“纯祝福 vs 附促销”的同口径对照，本次按单一沟通目标原则仅送祝福',due:'今天 09:40',status:'pending'},
    {id:'t10',customer_id:8,category:'public_event',type:'公共事件关怀',funnel:'服务关系·中性关怀',reason:'所在地出现公开天气/交通预警（演示）',objective:'确认出行是否受影响，不绑定产品销售',touch_angle:'根据其差旅特征发送简短出行提醒',prompt:'仅基于公开天气或交通信息进行中性问候，不讨论政治立场，不附营销信息。',previous_touch:'近30天无公共事件类关怀',recommended_scene:'ice_break',optimization_hint:'公共事件触达只在信息与所在地匹配且授权有效时执行',due:'今天 08:50',status:'pending'},
    {id:'t11',customer_id:6,category:'daily',type:'新用户基础触达',funnel:'低意向·初步了解',reason:'首次问卷完成后24小时',objective:'让用户选一个最容易回答的问题',touch_angle:'跳出产品介绍，从日常节奏与信息偏好切入',prompt:'用户是保健品新手，但可从通勤、运动休闲或工作节奏等一般生活场景自然开口。',previous_touch:'尚未进行人工触达',recommended_scene:'ice_break',optimization_hint:'低意向新客使用生活场景问题，不直接问购买计划',due:'明天 18:30',status:'pending'}
  ];
  let optimizationVersion=3;
  const performance=()=>({date_label:'演示昨日',is_demo:true,metrics:{assigned:100,completed:88,opening_rate:62,reply_rate:35,intent_rate:22,conversion_rate:8,care_positive_rate:70},deltas:{opening_rate:4,reply_rate:2,intent_rate:1,conversion_rate:-1},by_category:[{label:'客户消息回复',opening_rate:90,intent_rate:45,conversion_rate:16},{label:'意向逐层跟进',opening_rate:70,intent_rate:32,conversion_rate:12},{label:'购买后定期关怀',opening_rate:75,intent_rate:20,conversion_rate:7},{label:'生日关怀',opening_rate:82,intent_rate:12,conversion_rate:4},{label:'沉默用户唤醒',opening_rate:30,intent_rate:8,conversion_rate:2}],optimization:{version:`D+1 V${optimizationVersion}`,generated_at:now(),winners:['具体来由 + 单一问题：模拟样本200触达、24回复','基于模拟记录的个别跟进：80触达、12回复、3成交','模拟使用回访：240触达、18回复，优先于直接推活动'],adjustments:['模拟长清单样本800触达仅12回复，今日拆成单问题','模拟催促批次600触达0回复，默认禁用虚假紧迫感','称呼改用脱敏资料中的展示名，不再默认“亲、姐、哥”'],today_focus:'先开口、再判断、后推进：承接演示上下文，每条消息只留一个容易回答的问题，收到回复后再进入下一回合。',next_review:'今日 18:30 自动复盘'}});
  let loggedIn=false,sequence=100;
  const conversations=new Map(customers.map(c=>[c.id,{id:c.id,customer_id:c.id,scene:'consult',messages:[{role:'operator',content:`您好${c.name.slice(0,1)}老师，上次关注的内容还有哪里需要我说明吗？`,time:'前次沟通'},{role:'customer',content:c.last_message,time:c.last_time}],suggestion:null}]));
  const ok=(data,status=200)=>Promise.resolve(new Response(JSON.stringify({success:true,data,error:null,request_id:'operator-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const fail=(message,status=404)=>Promise.resolve(new Response(JSON.stringify({success:false,data:null,error:{message},request_id:'operator-demo'}),{status,headers:{'Content-Type':'application/json; charset=utf-8'}}));
  const body=options=>{try{return JSON.parse(options?.body||'{}')}catch{return {}}};
  const customer=id=>customers.find(x=>x.id===Number(id));
  function suggestionFor(c,message,scene,task){
    const sensitive=/治疗|治好|药|医生|怀孕|孕期|严重|胸痛|呼吸困难/.test(message);
    const address=c.name;
    const taskReply=task?.category==='birthday'
      ?`${address}，提前祝您生日快乐。希望新的一岁，工作和家里的事都顺顺利利。今天就是来送个祝福，不带任务 😊`
      :task?.category==='public_event'
        ?`${address}，看到${c.city}这两天有天气和出行提醒，想起您平时也会出差。今天出门的话多留一点时间，路上注意安全，不用特意回我。`
        :task?.category==='purchase_care'
          ?`${address}，上次咱们确认过使用方法，我来问一句：这段时间基本按计划在用，还是偶尔会忘？有哪里不清楚也直接告诉我。`
          :task?.category==='reactivation'
            ?`${address}，上次您说“${c.last_message.slice(0,24)}”，我后来就没继续追着发。今天只想确认一下：您还想看一版简短要点，还是这件事先放一放？`
            :task?.category==='daily'
              ?`${address}，我是之前直播后和您联系的演示顾问A。记得您问过${c.product_focus}的区别，我先不发长介绍：您现在更想先看成分差异，还是日常怎么选？`
              :task?.category==='intent'
                ?`${address}，上次您说“${c.last_message.slice(0,26)}”。到咱们约好的时间了，我来问一句：现在主要是家里人还想确认，还是您自己还有一个点没想清楚？`
              :null;
    const reply=sensitive
      ?`您提到的情况涉及专业医疗判断，我不能仅根据产品信息给出结论。建议先咨询医生或药师；如果您愿意，我可以只把${c.product_focus}的公开成分信息和注意事项整理给您参考。`
      :taskReply
        ?taskReply
        :scene==='objection'
        ?`${address}，您会把安全和长期花费一起考虑，很正常。咱们先不急着定方案——您现在更想先把不适合的情况弄清楚，还是先把一个周期大概花费算明白？`
        :scene==='follow'
          ?`${address}，上次您提到“${c.last_message.slice(0,28)}”。我把最关键的内容压成了三点，您想看的话我发；暂时不需要也没关系。`
          :scene==='ice_break'
            ?`${address}，看到您之前留意过${c.product_focus}。我先不发一大段资料，想问个简单的：您是刚开始了解，还是已经对比过一些了？`
            :scene==='close'
              ?`${address}，按刚才确认的情况，先从轻一点的选择更合适。我把内容、注意点和一个周期的明细发您，您看完再决定，不着急现在答复。`
              :`${address}，您刚才提到的点我收到了。咱们先只解决一个问题：关于${c.product_focus}，您最想先确认使用边界、主要区别，还是预算？`;
    const alternatives=sensitive
      ?[`这件事我不想只凭产品资料给您下结论。您先问医生或药师更稳妥，需要的话我把成分表和注意事项整理给您。`,`我先不做个体判断。可以把公开资料发您，方便您带着具体信息去咨询专业人员。`]
      :[`我记得您之前更关注${c.product_focus}。今天不展开说，您只要告诉我：继续了解，还是先放一放？`,`${address}，我把上次的话题记着。您如果还想了解，我按您最关心的一点说；如果暂时不需要，我就不往下发了。`];
    const nextTurns=[
      {when:'用户愿意继续',reply:'先复述用户选择，再只补充对应的一点信息，结尾问一个问题。'},
      {when:'用户说再考虑',reply:'确认其考虑点和下次联系时间，不马上追加优惠。'},
      {when:'用户拒绝或不需要',reply:'接受拒绝，确认是否暂停同类消息，并结束本轮。'}
    ];
    return {reply,alternatives,next_turns:nextTurns,human_score:sensitive?86:92,human_checks:['承接真实上下文','一条消息一个目标','只留一个易答问题','无虚构稀缺与效果','称呼来自现有资料'],historical_basis:'参考历史触达：具体上下文与单问句优先；长清单和强稀缺表达降权。',reason:`基于当前消息、${c.product_focus}关注事实、${c.persona.decision_style}的沟通判断${task?`及“${task.type}”任务`:''}生成`,policy_flags:sensitive?['触发医疗边界','禁止个体化用药建议','需要人工确认']:['不使用绝对功效','不把推断当事实','不涉及政治立场定向','不暴露内部信息','发送前人工确认'],provider:'Dotbest Human-tone Agent'};
  }
  window.fetch=async(input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url,location.href);const path=url.pathname.replace(/^\/[^/]+(?=\/api\/)/,'');const method=(options.method||'GET').toUpperCase();
    if(path==='/api/login'&&method==='POST'){loggedIn=true;return ok({display_name:'演示顾问A',role:'一线运营'})}
    if(path==='/api/logout'&&method==='POST'){loggedIn=false;return ok({})}
    if(path==='/api/me')return loggedIn?ok({id:1,display_name:'演示顾问A',role:'一线运营',permissions:['customer:read','conversation:reply','task:update']}):fail('请先登录',401);
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
    if(path==='/api/v1/private/scripts')return ok({items:scripts,scenes:[...new Set(scripts.map(x=>x.scene))],lifecycle:[{customer_type:'新客',path:['触达激活','需求转化','成交转化','售后复购','相关裂变']},{customer_type:'存量老客',path:['沉睡唤醒','用户关怀','复购增购','定期维护','裂变转介']}],historical_learning:historicalLearning});
    if(path==='/api/v1/private/governance')return ok({role:'一线运营',allowed:['查看本人负责用户的脱敏资料','查看内部辅助摘要及事实依据','生成、编辑和复制回复建议','更新本人触达任务与跟进记录'],blocked:['访问后台订单管理','查看经营决策与利润报表','导出完整手机号等敏感字段','将内部标签、评分或推断直接发送给客户'],audit:[{time:'今天 09:18',action:'生成回复建议',object:'示例用户01',result:'通过合规检查'},{time:'昨天 17:42',action:'暂停触达',object:'示例用户07',result:'已写入免打扰'}]});
    return fail('演示接口不存在');
  };
})();
