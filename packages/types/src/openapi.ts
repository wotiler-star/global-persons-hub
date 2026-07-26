// OpenAPI 3 契约文档（契约先行 / Contract-First）
// 后端在 /openapi.json 暴露此文档；前端据此生成客户端或对齐字段。
// 体现原则：前后端分离 + 先进实用的 API 治理。

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'Global Persons Hub API',
    version: '0.1.0',
    description: '全球知名人物志 · 开放人物数据 API（跨领域 / 全语种 / 知识图谱）'
  },
  servers: [{ url: 'http://127.0.0.1:8787', description: '本地开发' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      apiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: '开放 API 密钥（替代 JWT 访问公开读接口，并计入月度配额）'
      }
    }
  },
  paths: {
    '/persons': {
      get: {
        summary: '列出人物（支持搜索 / 领域 / 语种过滤 + 分页）',
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'domain', in: 'query', schema: { type: 'string' } },
          { name: 'lang', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } }
        ],
        responses: { '200': { description: '人物列表' } }
      },
      post: {
        summary: '创建人物（需登录；第三方用户可上传自己的个人数据）',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: '已创建' } }
      }
    },
    '/persons/{slug}': {
      get: { summary: '获取单个人物（结构化 + 关系图谱）', responses: { '200': { description: '人物详情' } } },
      patch: { summary: '编辑人物（需登录，本人或专家/管理员）', security: [{ bearerAuth: [] }] }
    },
    '/search': {
      get: { summary: '跨领域关键词/全文搜索', responses: { '200': { description: '搜索结果' } } }
    },
    '/search/semantic': {
      get: {
        summary: '向量（语义）检索：pgvector 余弦 / 本地余弦，返回带相似度的命中',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'lang', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } }
        ],
        responses: { '200': { description: '语义检索结果（含相似度）' } }
      }
    },
    '/rag/ask': {
      get: {
        summary: 'RAG 事实问答（GET 便捷入口）',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'lang', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } }
        ],
        responses: { '200': { description: '带引用的回答 + 来源' } }
      },
      post: {
        summary: 'RAG 事实问答（POST 主入口）：检索增强生成 / 抽取式兜底',
        responses: { '200': { description: '带引用的回答 + 来源' } }
      }
    },
    '/relations/{id}': {
      get: { summary: '获取人物关系图谱（邻接）', responses: { '200': { description: '关系边列表' } } }
    },
    '/graph/network/{id}': {
      get: {
        summary: '多跳关系网络遍历（Neo4j / BFS 回退），depth 可配',
        parameters: [{ name: 'depth', in: 'query', schema: { type: 'integer', default: 2 } }],
        responses: { '200': { description: '网络节点与边' } }
      }
    },
    '/admin/persons/pending': {
      get: {
        summary: 'UGC 审核队列（admin/expert）：列出待审核人物',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '待审核人物列表' } }
      }
    },
    '/admin/persons/{id}/status': {
      patch: {
        summary: '审核裁决（admin/expert）：approve→ugc_verified / reject→ai_draft / pending→ugc_pending',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '更新后的人物' } }
      }
    },
    '/admin/persons/{id}/endorse': {
      post: {
        summary: 'PGC 专家背书（admin/expert）：追加背书并自动升级 ugc_verified→pgc',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '背书后的人物（含 endorsements）' } }
      }
    },
    '/admin/users': {
      get: {
        summary: '用户列表（仅 admin，用于提升 PGC 专家）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '注册用户列表（不含密码）' } }
      }
    },
    '/admin/users/{id}/role': {
      patch: {
        summary: '调整用户角色（仅 admin）：user / expert / admin',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '更新后的用户' } }
      }
    },
    '/auth/register': { post: { summary: '第三方用户注册', responses: { '201': { description: '已注册' } } } },
    '/auth/login': { post: { summary: '登录获取 JWT', responses: { '200': { description: 'token' } } } },
    '/me/persons': {
      get: { summary: '获取当前用户上传/编辑的人物', security: [{ bearerAuth: [] }] },
      responses: { '200': { description: '我的提交' } }
    },
    '/me': {
      get: {
        summary: '当前用户（含订阅套餐 plan）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '当前用户' } }
      }
    },
    '/me/apikeys': {
      get: {
        summary: '列出我的开放 API 密钥（含用量/配额）',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '密钥列表' } }
      },
      post: {
        summary: '创建开放 API 密钥（明文仅此刻返回一次）',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: '已创建（含 key 明文）' } }
      }
    },
    '/me/apikeys/{id}': {
      delete: {
        summary: '吊销 API 密钥',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '已吊销' } }
      }
    },
    '/me/subscribe': {
      post: {
        summary: '升级/降级订阅套餐（mock，无真实支付）：{ plan: free|pro }',
        security: [{ bearerAuth: [] }],
        responses: { '200': { description: '更新后的用户' } }
      }
    },
    '/upload': {
      post: {
        summary: '图片上传（base64 JSON：{ file: data:image/...;base64,... }），返回 /uploads/* URL',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: '已上传' } }
      }
    },
    '/persons/{slug}/comments': {
      get: { summary: '列出人物公开评论', responses: { '200': { description: '评论列表' } } },
      post: {
        summary: '发表评论（需登录）：{ body }',
        security: [{ bearerAuth: [] }],
        responses: { '201': { description: '已发布' } }
      }
    }
  }
} as const;
