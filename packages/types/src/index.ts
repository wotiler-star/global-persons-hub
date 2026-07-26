// 共享领域模型与 API 契约类型（前后端共用，契约先行）
// 本文件是"前后端分离"的单一事实来源：前端(apps/web)与后端(apps/api)均 import 此处类型。

/** 支持的语种（全语种母语可读，中英双核，现已覆盖 13 种） */
export type Lang =
  | 'zh' | 'en' | 'es' | 'fr' | 'ja' | 'ru' | 'ar' | 'pt'
  | 'de' | 'ko' | 'it' | 'hi' | 'id';

export const LANGS: Lang[] = [
  'zh', 'en', 'es', 'fr', 'ja', 'ru', 'ar', 'pt',
  'de', 'ko', 'it', 'hi', 'id'
];

export const LANG_LABELS: Record<Lang, string> = {
  zh: '中文', en: 'English', es: 'Español', fr: 'Français',
  ja: '日本語', ru: 'Русский', ar: 'العربية', pt: 'Português',
  de: 'Deutsch', ko: '한국어', it: 'Italiano', hi: 'हिन्दी', id: 'Bahasa Indonesia'
};

/** 覆盖全赛道（跨领域统一画像） */
export type Domain =
  | 'film'        // 影视
  | 'business'    // 商业
  | 'academic'    // 学术
  | 'sports'      // 体育
  | 'music'       // 音乐
  | 'politics'    // 政治
  | 'tech'        // 科技
  | 'art'         // 艺术
  | 'other';      // 其他

export const DOMAIN_LABELS: Record<Domain, string> = {
  film: '影视', business: '商业', academic: '学术', sports: '体育',
  music: '音乐', politics: '政治', tech: '科技', art: '艺术', other: '其他'
};

/** 权威分级（PGC 核心 + UGC 长尾 + AI 补全 + 审核态） */
export type TrustLevel = 'pgc' | 'ugc_verified' | 'ugc_pending' | 'ai_draft';

/** 订阅套餐：free（默认）/ pro（专业版，更高 API 配额 + 解锁能力） */
export type UserPlan = 'free' | 'pro';

/** 多语文本：键为语种，值为该语文案 */
export type LocalizedText = Partial<Record<Lang, string>>;

export interface Source {
  url: string;
  title?: string;
  publisher?: string;
}

/** 关系边（知识图谱：人物-人物 / 人物-组织 / 人物-作品） */
export interface Relation {
  type: 'family' | 'mentor' | 'collab' | 'affiliated' | 'influence' | 'rival' | 'other';
  targetId: string;        // 目标人物 id（若为组织/作品可用字符串标识）
  label?: LocalizedText;   // 关系说明，如 "联合创始人"
  directed?: boolean;      // 是否有方向（影响/师徒有方向）
}

export interface Affiliation {
  name: LocalizedText;
  type?: 'company' | 'school' | 'org' | 'government';
}

/** 亲属关系类型（人物关系族谱用） */
export type KinRelation =
  | 'father' | 'mother'
  | 'grandfather' | 'grandmother'
  | 'spouse' | 'exSpouse' | 'partner'
  | 'brother' | 'sister' | 'halfBrother' | 'halfSister'
  | 'son' | 'daughter' | 'grandson' | 'granddaughter'
  | 'adoptiveFather' | 'adoptiveMother' | 'stepfather' | 'stepmother';

/** 亲属成员（三代内亲人，附详细资料介绍与溯源） */
export interface KinMember {
  name: Partial<Record<Lang, string>>;     // 至少含 zh/en
  relation: KinRelation;                    // 与本人的关系
  generation: number;                       // -2 祖辈 / -1 父母 / 0 同辈(配偶·兄弟姐妹) / +1 子女 / +2 孙辈
  birth?: string;                           // 生年或 ISO 日期
  death?: string;                           // 卒年或 ISO 日期（在世可空）
  bio?: Partial<Record<Lang, string>>;      // 详细人物资料介绍（多语）
  slug?: string;                            // 若同时是库内人物，可跳转其档案
  wiki?: string;                            // 维基百科溯源链接
}

/** PGC 专家背书：专家/管理员为人物档案做权威背书（可溯源、可展示） */
export interface Endorsement {
  id: string;
  expertId: string;
  expertName: string;
  comment?: string;
  createdAt: string;
}

/** 核心实体：人物（结构化知识图谱底座） */
export interface Person {
  id: string;
  slug: string;                       // URL 友好标识，用于 /person/[slug]
  names: Partial<Record<Lang, string>>;        // 各语种正式名称（同名消歧后唯一，可部分翻译）
  aliases?: string[];                 // 别名 / 译名 / 曾用名
  birth?: string;                     // ISO 日期，在世人物仅 birth
  death?: string;
  nationalities?: string[];
  domains: Domain[];                  // 跨赛道身份聚合
  occupations?: LocalizedText;
  summary: Partial<Record<Lang, string>>;      // 各语种简介（机器可读 + 可引用，可部分翻译）
  achievements?: LocalizedText[];
  affiliations?: Affiliation[];
  imageUrl?: string;
  images?: string[];                 // 图集（用户上传的图片，落盘于 /uploads）
  sources: Source[];                  // 每条事实可溯源（权威分级依据）
  relations: Relation[];
  kin?: KinMember[];                        // 三代内亲属资料与族谱（Stage 9）
  trustLevel: TrustLevel;
  endorsements?: Endorsement[];      // PGC 专家背书（有背书 → 权威升级 pgc）
  metrics?: { influence?: number; netWorth?: number; citations?: number };
  createdBy?: string;                 // 第三方用户 id（UGC 上传编辑）
  langVersions: Lang[];               // 已存在译文的语种
  createdAt: string;
  updatedAt: string;
}

/** 注册用户（第三方用户可上传编辑自己的个人数据库） */
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'expert' | 'admin';
  plan?: UserPlan;                   // 订阅套餐：free / pro
  createdAt: string;
}

export type PublicUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'plan'>;

/** 开放 API 密钥视图（不含密钥明文与哈希，仅用于列表展示） */
export interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;                    // 密钥前 8 位，用于辨识
  quotaMonth: number;                // 每月请求配额
  usedMonth: number;                 // 本月已用
  active: boolean;
  resetAt: string;                   // 下次配额重置时间（ISO）
  createdAt: string;
}

/** 创建 API 密钥时的一次性返回（含明文，仅此刻可见） */
export interface ApiKeyCreated {
  key: string;
  view: ApiKeyView;
}

/** 人物评论（社区规模化起点：用户可在人物页讨论） */
export interface Comment {
  id: string;
  personId: string;
  personSlug: string;
  userId: string;
  userName: string;
  body: string;
  status: 'published' | 'hidden';
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

// ---------- API 契约（REST）----------

export interface ListPersonsQuery {
  q?: string;
  domain?: Domain;
  lang?: Lang;
  page?: number;
  pageSize?: number;
}

export interface ListPersonsResult {
  items: Person[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  error: string;
  message: string;
}

/** 创建/更新人物时由客户端提交的负载（缺 id/审计字段） */
export type PersonInput = Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'trustLevel' | 'langVersions' | 'endorsements'> & {
  trustLevel?: TrustLevel;
};

export type LoginInput = { email: string; password: string };
export type RegisterInput = { email: string; password: string; name: string };
