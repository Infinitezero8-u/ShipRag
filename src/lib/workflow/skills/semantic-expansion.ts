/**
 * Skill: 语义扩展 (Semantic Expansion)
 *
 * 功能: 将口语/自然语言映射为数据库中的专业术语,
 *      解决"漏油"→"污染防治"→"oil pollution"的语义鸿沟。
 *
 * 适用: 用户用口语描述问题但知识库用法律术语存储的场景
 */

interface ExpansionRule { pattern: RegExp; expansion: string; weight: number }

// 口语→法律术语映射表 (领域知识)
const EXPANSIONS: ExpansionRule[] = [
  // 船舶事故
  { pattern: /漏油|溢油|油污|油泄露/, expansion: '防治船舶污染海洋环境', weight: 0.9 },
  { pattern: /撞船|碰撞|撞了/, expansion: '船舶碰撞 安全管理', weight: 0.9 },
  { pattern: /搁浅|触礁|座礁/, expansion: '船舶搁浅 安全管理', weight: 0.9 },
  { pattern: /沉没|沉船|打捞/, expansion: '沉船打捞 船舶', weight: 0.85 },

  // 人员安全
  { pattern: /落水|坠海|人员落水/, expansion: '人员落水 救生 船员', weight: 0.9 },
  { pattern: /船员|海员|水手.*(证|培训|资格)/, expansion: '船员适任 培训 STCW', weight: 0.85 },

  // 货物与装载
  { pattern: /超载|装多了|超重/, expansion: '船舶载重线 超载 安全管理', weight: 0.85 },
  { pattern: /危险品|危险.*(货|物)|化学品.*(船|运输)/, expansion: '危险货物 船舶载运 安全管理', weight: 0.9 },

  // 港口运营
  { pattern: /靠港|进港|泊位|靠泊/, expansion: '船舶进出港 泊位 港口', weight: 0.8 },
  { pattern: /装卸|集装箱|货柜/, expansion: '港口装卸 集装箱 作业安全', weight: 0.8 },

  // 环保
  { pattern: /排放|废气|污水|垃圾.*(扔|丢|倒)/, expansion: '船舶排放 防污染 MARPOL', weight: 0.85 },
  { pattern: /压载水|压舱水/, expansion: '船舶压载水 海洋生物入侵 防污染', weight: 0.9 },

  // 行政管理
  { pattern: /办证|许可证|执照|资质/, expansion: '行政许可 经营许可 船舶证书', weight: 0.8 },
  { pattern: /罚款|处罚|罚钱|扣.*(分|船|证)/, expansion: '行政处罚 罚款 违规', weight: 0.8 },
  { pattern: /投诉|举报|检举/, expansion: '投诉举报 监督管理', weight: 0.75 },

  // 安全设施
  { pattern: /灭火|消防|火灾|着火/, expansion: '船舶消防 防火 安全管理', weight: 0.9 },
  { pattern: /救生|逃生|撤离/, expansion: '救生设备 SOLAS 应急', weight: 0.9 },

  // 航行规则
  { pattern: /限速|开多快|航速/, expansion: '船舶航速 限速 航行安全', weight: 0.8 },
  { pattern: /航道|航线|怎么走/, expansion: '航道 航线 航行规则', weight: 0.75 },
];

/**
 * 对查询进行语义扩展,返回加权扩展词列表
 */
export function expandQuery(query: string): { expanded: string; rules: ExpansionRule[] } {
  const matched: ExpansionRule[] = [];
  for (const rule of EXPANSIONS) {
    if (rule.pattern.test(query)) matched.push(rule);
  }

  if (matched.length === 0) return { expanded: query, rules: [] };

  // 高权重规则优先
  matched.sort((a, b) => b.weight - a.weight);
  const best = matched.slice(0, 2);
  const expansion = best.map(r => r.expansion).join(' ');
  const expanded = `${query} ${expansion}`;

  return { expanded, rules: best };
}

export function shouldUseSemanticExpansion(query: string): boolean {
  return EXPANSIONS.some(r => r.pattern.test(query));
}
