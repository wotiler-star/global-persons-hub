// 生产级适配器：PostgreSQL（系统记录 + 全文检索）+ Neo4j（关系图谱遍历）
// 设计要点：
//  - PostgreSQL 为事实源（users/persons/多语子表/relations），保证事务一致与可溯源；
//  - Neo4j 承载关系网络遍历（getNetwork），每次涉及关系的写操作后整体 syncGraph() 与之对齐；
//  - Neo4j 不可达时自动降级为 PG 内存 BFS，保证可用性（详见 README）。
import pg from 'pg';
import neo4j, { Driver, auth as neo4jAuth } from 'neo4j-driver';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  Person, PublicUser, ListPersonsQuery, ListPersonsResult,
  PersonInput, Relation, RegisterInput, LoginInput, Lang, TrustLevel, LocalizedText,
  ApiKeyView, ApiKeyCreated, Comment
} from '@gph/types';
import { LANGS } from '@gph/types';
import { slugify } from './util.js';
import { hashPassword, verifyPassword, toPublic, generateApiKey, QUOTA_BY_PLAN } from './crypto.js';
import { getEmbedder, getEmbedderDim, toPgVector } from '../embedding/index.js';
import { personCorpus, buildChunks } from './corpus.js';
import type { DataStore, UserRecord, RelationView, SearchHit, Network, NetworkNode, NetworkEdge, VectorHit, AdminStats, AuditEntry } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA = join(__dirname, 'schema.sql');

type PersonRow = {
  id: string; slug: string; trust_level: TrustLevel; domains: string[]; birth?: string; death?: string;
  nationalities: string[]; aliases: string[]; achievements: any; affiliations: any; image_url?: string;
  sources: any; metrics: any; created_by?: string; lang_versions: string[]; search_tsv?: any;
  created_at: Date; updated_at: Date;
};

export class PgNeo4jStore implements DataStore {
  private pool: pg.Pool;
  private driver: Driver | null = null;
  private neoReady = false;
  // 令牌吊销黑名单（进程内）：PG 驱动为可选替换实现，登出即时失效仅需本进程范围
  private revoked = new Set<string>();

  constructor() {
    this.pool = new pg.Pool({
      connectionString: process.env.PG_URL || 'postgresql://gph:gph@localhost:5432/gph'
    });
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const pass = process.env.NEO4J_PASS || 'gphgph';
    try {
      this.driver = neo4j.driver(uri, neo4jAuth.basic(user, pass));
    } catch (e) {
      console.warn('[neo4j] driver init skipped:', (e as Error).message);
      this.driver = null;
    }
  }

  // ---------------- 生命周期 ----------------
  async init() {
    // 按嵌入维度把 schema.sql 中的 vector(384) 替换为实际维度（与嵌入模型对齐）
    const dim = getEmbedderDim();
    const sql = readFileSync(SCHEMA, 'utf-8').replaceAll('vector(384)', `vector(${dim})`);
    await this.pool.query(sql);
    if (this.driver) {
      try {
        const session = this.driver.session();
        await session.run('CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.id IS UNIQUE');
        await session.run('CREATE INDEX person_slug IF NOT EXISTS FOR (p:Person) ON (p.slug)');
        await session.close();
        this.neoReady = true;
        console.log('[neo4j] connected & constraints ensured');
      } catch (e) {
        console.warn('[neo4j] unavailable, graph traversal disabled (PG-only):', (e as Error).message);
        this.neoReady = false;
      }
    } else {
      console.log('[neo4j] no driver, running PG-only (graph via BFS fallback)');
    }
  }

  async seedIfEmpty(seedPath: string) {
    const { rows } = await this.pool.query('SELECT count(*)::int AS c FROM persons');
    if (rows[0].c > 0) return;
    const seed: Person[] = JSON.parse(readFileSync(seedPath, 'utf-8'));
    for (const p of seed) {
      await this.insertPersonFull(p, p.trustLevel || 'pgc');
    }
    console.log(`[seed] inserted ${seed.length} persons into PostgreSQL`);
    if (this.neoReady) await this.syncGraph();
  }

  // ---------------- 映射 ----------------
  private rowToPerson(
    p: PersonRow,
    names: { lang: string; name: string }[],
    summaries: { lang: string; body: string }[],
    occupations: { lang: string; value: string }[],
    relations: { id: string; to_id: string; type: string; label: any; directed: boolean }[]
  ): Person {
    const nm = {} as Record<Lang, string>;
    for (const l of LANGS) nm[l] = names.find((r) => r.lang === l)?.name || '';
    const sm = {} as Record<Lang, string>;
    for (const l of LANGS) sm[l] = summaries.find((r) => r.lang === l)?.body || '';
    const occ: Partial<Record<Lang, string>> = {};
    occupations.forEach((r) => (occ[r.lang as Lang] = r.value));
    const rels: Relation[] = relations.map((r) => ({
      type: r.type as Relation['type'],
      targetId: r.to_id,
      label: r.label || undefined,
      directed: r.directed
    }));
    const langVersions = LANGS.filter((l) => nm[l] || sm[l]);
    return {
      id: p.id, slug: p.slug, names: nm, aliases: p.aliases, birth: p.birth, death: p.death,
      nationalities: p.nationalities, domains: p.domains as Person['domains'], occupations: occ,
      summary: sm, achievements: p.achievements || [], affiliations: p.affiliations || [],
      imageUrl: p.image_url, sources: p.sources || [], relations: rels, trustLevel: p.trust_level,
      metrics: p.metrics || undefined, createdBy: p.created_by, langVersions,
      createdAt: new Date(p.created_at).toISOString(), updatedAt: new Date(p.updated_at).toISOString()
    };
  }

  private async assemblePerson(id: string): Promise<Person | null> {
    const pRes = await this.pool.query('SELECT * FROM persons WHERE id=$1', [id]);
    if (pRes.rows.length === 0) return null;
    const p = pRes.rows[0] as PersonRow;
    const [n, s, o, r, e] = await Promise.all([
      this.pool.query('SELECT lang,name FROM person_names WHERE person_id=$1', [id]),
      this.pool.query('SELECT lang,body FROM person_summaries WHERE person_id=$1', [id]),
      this.pool.query('SELECT lang,value FROM person_occupations WHERE person_id=$1', [id]),
      this.pool.query('SELECT id,to_id,type,label,directed FROM relations WHERE from_id=$1', [id]),
      this.pool.query(
        'SELECT id, expert_id, expert_name, comment, created_at FROM endorsements WHERE person_id=$1 ORDER BY created_at DESC',
        [id]
      )
    ]);
    const person = this.rowToPerson(p, n.rows, s.rows, o.rows, r.rows);
    if (e.rows.length) {
      person.endorsements = e.rows.map((x: any) => ({
        id: x.id, expertId: x.expert_id, expertName: x.expert_name,
        comment: x.comment || undefined, createdAt: new Date(x.created_at).toISOString()
      }));
    }
    return person;
  }

  private async assembleMany(ids: string[]): Promise<Person[]> {
    if (ids.length === 0) return [];
    const [ps, ns, ss, os, rs, es] = await Promise.all([
      this.pool.query('SELECT * FROM persons WHERE id = ANY($1)', [ids]),
      this.pool.query('SELECT * FROM person_names WHERE person_id = ANY($1)', [ids]),
      this.pool.query('SELECT * FROM person_summaries WHERE person_id = ANY($1)', [ids]),
      this.pool.query('SELECT * FROM person_occupations WHERE person_id = ANY($1)', [ids]),
      this.pool.query('SELECT * FROM relations WHERE from_id = ANY($1)', [ids]),
      this.pool.query('SELECT * FROM endorsements WHERE person_id = ANY($1) ORDER BY created_at DESC', [ids])
    ]);
    const byId = new Map<string, Person>();
    for (const p of ps.rows as PersonRow[]) {
      const n = ns.rows.filter((x: any) => x.person_id === p.id);
      const s = ss.rows.filter((x: any) => x.person_id === p.id);
      const o = os.rows.filter((x: any) => x.person_id === p.id);
      const r = rs.rows.filter((x: any) => x.from_id === p.id);
      const person = this.rowToPerson(p, n, s, o, r);
      const e = es.rows.filter((x: any) => x.person_id === p.id);
      if (e.length) {
        person.endorsements = e.map((x: any) => ({
          id: x.id, expertId: x.expert_id, expertName: x.expert_name,
          comment: x.comment || undefined, createdAt: new Date(x.created_at).toISOString()
        }));
      }
      byId.set(p.id, person);
    }
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  }

  // ---------------- 写入辅助 ----------------
  private async insertPersonFull(person: Person, trustOverride?: TrustLevel, createdBy?: string) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO persons
          (id,slug,trust_level,domains,birth,death,nationalities,aliases,achievements,affiliations,image_url,sources,metrics,created_by,lang_versions)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          person.id, person.slug, trustOverride ?? person.trustLevel, person.domains,
          person.birth ?? null, person.death ?? null, person.nationalities ?? [],
          person.aliases ?? [], JSON.stringify(person.achievements ?? []),
          JSON.stringify(person.affiliations ?? []), person.imageUrl ?? null,
          JSON.stringify(person.sources ?? []), JSON.stringify(person.metrics ?? null),
          createdBy ?? person.createdBy ?? null, person.langVersions
        ]
      );
      for (const l of LANGS) {
        const name = (person.names as any)[l];
        if (name) await client.query('INSERT INTO person_names (person_id,lang,name) VALUES ($1,$2,$3)', [person.id, l, name]);
        const body = (person.summary as any)[l];
        if (body) await client.query('INSERT INTO person_summaries (person_id,lang,body) VALUES ($1,$2,$3)', [person.id, l, body]);
        const occ = (person.occupations as any)?.[l];
        if (occ) await client.query('INSERT INTO person_occupations (person_id,lang,value) VALUES ($1,$2,$3)', [person.id, l, occ]);
      }
      for (const r of person.relations) {
        await client.query(
          `INSERT INTO relations (id,from_id,to_id,type,label,directed,created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [randomUUID(), person.id, r.targetId, r.type, JSON.stringify(r.label ?? null), !!r.directed, createdBy ?? person.createdBy ?? null]
        );
      }
      // 向量化：整人向量 + 多语分块向量（供语义检索 / RAG 检索）
      await this.embedPersonInto(client, person);
      await client.query('SELECT refresh_person_tsv($1)', [person.id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // ---------------- 读接口 ----------------
  async listPersons(opts: ListPersonsQuery): Promise<ListPersonsResult> {
    const where: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (opts.q) {
      params.push(opts.q);
      where.push(
        `(p.search_tsv @@ plainto_tsquery('simple', $${i}) OR EXISTS(SELECT 1 FROM person_names n WHERE n.person_id=p.id AND n.name ILIKE '%'||$${i}||'%') OR p.aliases::text ILIKE '%'||$${i}||'%')`
      );
      i++;
    }
    if (opts.domain) { params.push(opts.domain); where.push(`p.domains @> ARRAY[$${i}]`); i++; }
    if (opts.lang) { params.push(opts.lang); where.push(`p.lang_versions @> ARRAY[$${i}]`); i++; }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const all = await this.pool.query(`SELECT id FROM persons p ${w} ORDER BY p.created_at DESC`, params);
    const total = all.rows.length;
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const ids = all.rows.slice((page - 1) * pageSize, page * pageSize).map((r: any) => r.id);
    const items = await this.assembleMany(ids);
    return { items, total, page, pageSize };
  }

  async getPerson(slug: string): Promise<Person | null> {
    const { rows } = await this.pool.query('SELECT id FROM persons WHERE id=$1 OR slug=$1', [slug]);
    if (rows.length === 0) return null;
    return this.assemblePerson(rows[0].id);
  }

  async search(q: string, limit = 12): Promise<SearchHit[]> {
    const { rows } = await this.pool.query(
      `SELECT id FROM persons p
       WHERE p.search_tsv @@ plainto_tsquery('simple',$1)
          OR EXISTS(SELECT 1 FROM person_names n WHERE n.person_id=p.id AND n.name ILIKE '%'||$1||'%')
          OR p.aliases::text ILIKE '%'||$1||'%'
       ORDER BY p.created_at DESC LIMIT $2`,
      [q || '', limit]
    );
    const persons = await this.assembleMany(rows.map((r: any) => r.id));
    return persons.map((p) => ({
      id: p.id, slug: p.slug, names: p.names, domains: p.domains,
      occupations: p.occupations, summary: p.summary, trustLevel: p.trustLevel
    }));
  }

  async createPerson(input: PersonInput, userId: string): Promise<Person> {
    const now = new Date().toISOString();
    const person: Person = {
      ...input,
      id: randomUUID(),
      slug: slugify(input.names.en || input.names.zh || Object.values(input.names)[0] || 'person'),
      trustLevel: input.trustLevel ?? 'ugc_pending',
      langVersions: (LANGS.filter((l) => (input.names as any)[l])) as Lang[],
      createdBy: userId,
      createdAt: now,
      updatedAt: now
    };
    await this.insertPersonFull(person, undefined, userId);
    if (this.neoReady) await this.syncGraph();
    return person;
  }

  async updatePerson(
    slug: string, patch: Partial<PersonInput>, userId: string, role: string
  ): Promise<Person | null> {
    const existing = await this.getPerson(slug);
    if (!existing) return null;
    if (existing.createdBy && existing.createdBy !== userId && role === 'user') return null;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const cols: string[] = [];
      const vals: any[] = [existing.id];
      let i = 2;
      if (patch.domains) { cols.push(`domains=$${i++}`); vals.push(patch.domains); }
      if (patch.birth !== undefined) { cols.push(`birth=$${i++}`); vals.push(patch.birth ?? null); }
      if (patch.death !== undefined) { cols.push(`death=$${i++}`); vals.push(patch.death ?? null); }
      if (patch.nationalities) { cols.push(`nationalities=$${i++}`); vals.push(patch.nationalities); }
      if (patch.aliases) { cols.push(`aliases=$${i++}`); vals.push(patch.aliases); }
      if (patch.achievements) { cols.push(`achievements=$${i++}`); vals.push(JSON.stringify(patch.achievements)); }
      if (patch.affiliations) { cols.push(`affiliations=$${i++}`); vals.push(JSON.stringify(patch.affiliations)); }
      if (patch.imageUrl !== undefined) { cols.push(`image_url=$${i++}`); vals.push(patch.imageUrl ?? null); }
      if (patch.sources) { cols.push(`sources=$${i++}`); vals.push(JSON.stringify(patch.sources)); }
      if (patch.metrics !== undefined) { cols.push(`metrics=$${i++}`); vals.push(JSON.stringify(patch.metrics ?? null)); }
      if (patch.trustLevel) { cols.push(`trust_level=$${i++}`); vals.push(patch.trustLevel); }
      cols.push(`updated_at=now()`);
      if (cols.length > 1) {
        await client.query(`UPDATE persons SET ${cols.join(',')} WHERE id=$1`, vals);
      }
      if (patch.names) {
        await client.query('DELETE FROM person_names WHERE person_id=$1', [existing.id]);
        for (const l of LANGS) {
          const name = (patch.names as any)[l];
          if (name) await client.query('INSERT INTO person_names (person_id,lang,name) VALUES ($1,$2,$3)', [existing.id, l, name]);
        }
      }
      if (patch.summary) {
        await client.query('DELETE FROM person_summaries WHERE person_id=$1', [existing.id]);
        for (const l of LANGS) {
          const body = (patch.summary as any)[l];
          if (body) await client.query('INSERT INTO person_summaries (person_id,lang,body) VALUES ($1,$2,$3)', [existing.id, l, body]);
        }
      }
      if (patch.occupations) {
        await client.query('DELETE FROM person_occupations WHERE person_id=$1', [existing.id]);
        for (const l of LANGS) {
          const occ = (patch.occupations as any)[l];
          if (occ) await client.query('INSERT INTO person_occupations (person_id,lang,value) VALUES ($1,$2,$3)', [existing.id, l, occ]);
        }
      }
      let relationsChanged = false;
      if (patch.relations) {
        relationsChanged = true;
        await client.query('DELETE FROM relations WHERE from_id=$1', [existing.id]);
        for (const r of patch.relations) {
          await client.query(
            `INSERT INTO relations (id,from_id,to_id,type,label,directed) VALUES ($1,$2,$3,$4,$5,$6)`,
            [randomUUID(), existing.id, r.targetId, r.type, JSON.stringify(r.label ?? null), !!r.directed]
          );
        }
      }
      await client.query('SELECT refresh_person_tsv($1)', [existing.id]);
      await client.query('COMMIT');
      const updated = await this.assemblePerson(existing.id);
      if (!updated) return null;
      // 向量重算：独立事务读取已提交数据，覆盖整人向量 + 分块向量
      const ec = await this.pool.connect();
      try {
        await ec.query('BEGIN');
        await this.embedPersonInto(ec, updated);
        await ec.query('COMMIT');
      } catch (e) {
        await ec.query('ROLLBACK');
        throw e;
      } finally {
        ec.release();
      }
      if (this.neoReady && relationsChanged) await this.syncGraph();
      return updated;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async getRelations(idOrSlug: string): Promise<{ person: Person; relations: RelationView[] } | null> {
    const { rows } = await this.pool.query('SELECT id FROM persons WHERE id=$1 OR slug=$1', [idOrSlug]);
    if (rows.length === 0) return null;
    const person = await this.assemblePerson(rows[0].id);
    if (!person) return null;
    const relRes = await this.pool.query(
      `SELECT r.to_id, r.type, r.label, r.directed, t.slug AS tslug, t.lang_versions
       FROM relations r LEFT JOIN persons t ON t.id=r.to_id
       WHERE r.from_id=$1 OR r.to_id=$1`,
      [person.id]
    );
    const targetIds = relRes.rows.map((r: any) => r.to_id).filter(Boolean);
    const targets = targetIds.length ? await this.assembleMany(targetIds) : [];
    const targetMap = new Map(targets.map((t) => [t.id, t]));
    const relations: RelationView[] = relRes.rows.map((r: any) => {
      const tp = targetMap.get(r.to_id);
      return {
        type: r.type, targetId: r.to_id, label: r.label || undefined, directed: r.directed,
        targetName: tp?.names, targetSlug: tp?.slug,
        // Stage 37+：区分出边/入边（to_id=本人物即为他人指向我的入边）
        incoming: r.to_id === person.id
      };
    });
    return { person, relations };
  }

  async mePersons(userId: string): Promise<Person[]> {
    const { rows } = await this.pool.query('SELECT id FROM persons WHERE created_by=$1 ORDER BY created_at DESC', [userId]);
    return this.assembleMany(rows.map((r: any) => r.id));
  }

  // ---------------- 用户 ----------------
  async registerUser(input: RegisterInput): Promise<{ user: PublicUser }> {
    const ex = await this.pool.query('SELECT id FROM users WHERE email=$1', [input.email]);
    if (ex.rows.length) throw { statusCode: 409, message: '该邮箱已注册' };
    const id = randomUUID();
    await this.pool.query(
      'INSERT INTO users (id,email,name,role,password_hash,created_at) VALUES ($1,$2,$3,$4,$5,now())',
      [id, input.email, input.name, 'user', hashPassword(input.password)]
    );
    return { user: { id, email: input.email, name: input.name, role: 'user' } };
  }

  async loginUser(input: LoginInput): Promise<{ user: PublicUser }> {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE email=$1', [input.email]);
    const u = rows[0] as UserRecord | undefined;
    if (!u || !verifyPassword(input.password, u.passwordHash)) {
      throw { statusCode: 401, message: '邮箱或密码错误' };
    }
    return { user: toPublic(u) };
  }

  // ---------------- 图谱（Neo4j） ----------------
  private async resolveId(idOrSlug: string): Promise<string | null> {
    const { rows } = await this.pool.query('SELECT id FROM persons WHERE id=$1 OR slug=$1', [idOrSlug]);
    return rows[0]?.id ?? null;
  }

  /** 以 PG 为事实源重建 Neo4j 图谱（清除后按 relations 表重建人物节点与 RELATES 边） */
  async syncGraph(): Promise<void> {
    if (!this.driver) return;
    const session = this.driver.session();
    try {
      await session.run('MATCH (n) DETACH DELETE n');
      const persons = await this.pool.query(
        `SELECT p.id, p.slug, p.trust_level,
                COALESCE((SELECT n.name FROM person_names n WHERE n.person_id=p.id AND n.lang='en' LIMIT 1),
                         (SELECT n.name FROM person_names n WHERE n.person_id=p.id AND n.lang='zh' LIMIT 1),
                         (SELECT n.name FROM person_names n WHERE n.person_id=p.id LIMIT 1)) AS name
         FROM persons p`
      );
      for (const p of persons.rows) {
        await session.run(
          'MERGE (n:Person {id:$id}) SET n.slug=$slug, n.name=$name, n.trustLevel=$trust',
          { id: p.id, slug: p.slug, name: p.name || p.id, trust: p.trust_level }
        );
      }
      const rels = await this.pool.query(
        `SELECT r.from_id, r.to_id, r.type, r.label, r.directed
         FROM relations r
         WHERE EXISTS(SELECT 1 FROM persons p1 WHERE p1.id=r.from_id)
           AND EXISTS(SELECT 1 FROM persons p2 WHERE p2.id=r.to_id)`
      );
      for (const r of rels.rows) {
        await session.run(
          `MATCH (a:Person {id:$from}),(b:Person {id:$to})
           MERGE (a)-[:RELATES {type:$type, label:$label, directed:$directed}]->(b)`,
          { from: r.from_id, to: r.to_id, type: r.type, label: r.label || null, directed: !!r.directed }
        );
      }
      console.log(`[neo4j] graph synced: ${persons.rows.length} nodes, ${rels.rows.length} edges`);
    } finally {
      await session.close();
    }
  }

  async getNetwork(idOrSlug: string, depth = 2): Promise<Network | null> {
    const start = await this.resolveId(idOrSlug);
    if (!start) return null;
    if (!this.neoReady || !this.driver) return this.getNetworkFromPg(start, depth);
    const session = this.driver.session();
    try {
      const sn = await session.run(
        'MATCH (p:Person {id:$id}) RETURN p.id AS id, p.slug AS slug, p.name AS name, p.trustLevel AS trust',
        { id: start }
      );
      if (sn.records.length === 0) return null;
      const nodes: NetworkNode[] = [];
      const edges: NetworkEdge[] = [];
      const visited = new Set<string>([start]);
      const r0 = sn.records[0];
      nodes.push({ id: r0.get('id'), slug: r0.get('slug'), name: r0.get('name'), trustLevel: r0.get('trust') });
      let frontier = [start];
      for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        for (const cur of frontier) {
          const res = await session.run(
            `MATCH (a:Person {id:$id})-[r:RELATES]-(b:Person)
             RETURN b.id AS tid, b.slug AS tslug, b.name AS tname, b.trustLevel AS ttrust,
                    r.type AS rtype, r.label AS rlabel, r.directed AS rdir`,
            { id: cur }
          );
          for (const rec of res.records) {
            const tid: string = rec.get('tid');
            if (!visited.has(tid)) {
              visited.add(tid);
              next.push(tid);
              nodes.push({ id: tid, slug: rec.get('tslug'), name: rec.get('tname'), trustLevel: rec.get('ttrust') });
            }
            const lbl = rec.get('rlabel');
            edges.push({
              source: cur, target: tid, type: rec.get('rtype'),
              label: lbl ? (lbl.en || lbl.zh || '') : '', directed: !!rec.get('rdir')
            });
          }
        }
        frontier = next;
      }
      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  /** PG-only 回退：用 relations 表做内存 BFS */
  private async getNetworkFromPg(start: string, depth: number): Promise<Network> {
    const nodes: NetworkNode[] = [];
    const edges: NetworkEdge[] = [];
    const visited = new Set<string>([start]);
    const sp = await this.assemblePerson(start);
    if (!sp) return { nodes, edges };
    nodes.push({ id: sp.id, slug: sp.slug, name: sp.names.en || sp.names.zh || sp.id, trustLevel: sp.trustLevel });
    let frontier = [start];
    for (let d = 0; d < depth; d++) {
      const next: string[] = [];
      for (const cur of frontier) {
        const res = await this.pool.query(
          `SELECT r.to_id AS tid, r.type, r.label, r.directed, t.slug AS tslug, t.names AS tnames, t.trust_level
           FROM relations r LEFT JOIN persons t ON t.id=r.to_id WHERE r.from_id=$1
           UNION
           SELECT r.from_id AS tid, r.type, r.label, r.directed, t.slug AS tslug, t.names AS tnames, t.trust_level
           FROM relations r LEFT JOIN persons t ON t.id=r.from_id WHERE r.to_id=$1`,
          [cur]
        );
        for (const r of res.rows) {
          const tid: string = r.tid;
          const tnames: any = r.tnames;
          const tname: string = (tnames && (tnames.en || tnames.zh)) || tid;
          if (!visited.has(tid)) {
            visited.add(tid);
            next.push(tid);
            nodes.push({ id: tid, slug: r.tslug, name: tname, trustLevel: r.trust_level });
          }
          const lbl = r.label;
          edges.push({ source: cur, target: tid, type: r.type, label: lbl ? (lbl.en || lbl.zh || '') : '', directed: !!r.directed });
        }
      }
      frontier = next;
    }
    return { nodes, edges };
  }

  /** Stage 37+：在关系表上做无向 BFS，返回两人最短路径子图（PG 回退：仅人物-人物，不含组织/亲属） */
  async getPath(fromIdOrSlug: string, toIdOrSlug: string): Promise<Network | null> {
    const a = await this.resolveId(fromIdOrSlug);
    const b = await this.resolveId(toIdOrSlug);
    if (!a || !b) return null;
    const parent = new Map<string, { from: string; type: string; label?: any; directed: boolean }>();
    const visited = new Set<string>([a]);
    let frontier = [a];
    let found = false;
    for (let d = 0; d < 6 && !found; d++) {
      const next: string[] = [];
      for (const cur of frontier) {
        const res = await this.pool.query(
          `SELECT r.to_id AS tid, r.type, r.label, r.directed FROM relations r WHERE r.from_id=$1
           UNION
           SELECT r.from_id AS tid, r.type, r.label, r.directed FROM relations r WHERE r.to_id=$1`,
          [cur]
        );
        for (const r of res.rows) {
          const tid: string = r.tid;
          if (visited.has(tid)) continue;
          visited.add(tid);
          parent.set(tid, { from: cur, type: r.type, label: r.label, directed: !!r.directed });
          if (tid === b) {
            found = true;
            break;
          }
          next.push(tid);
        }
        if (found) break;
      }
      frontier = next;
    }
    if (!parent.has(b)) return { nodes: [], edges: [] };
    const pathIds: string[] = [b];
    let cur = b;
    while (cur !== a) {
      cur = parent.get(cur)!.from;
      pathIds.push(cur);
    }
    pathIds.reverse();
    const nodes: NetworkNode[] = [];
    const edges: NetworkEdge[] = [];
    for (const id of pathIds) {
      const p = await this.assemblePerson(id);
      if (p) nodes.push({ id: p.id, slug: p.slug, name: p.names.en || p.names.zh || p.id, trustLevel: p.trustLevel, kind: 'person' });
    }
    for (let i = 0; i < pathIds.length - 1; i++) {
      const from = pathIds[i];
      const to = pathIds[i + 1];
      const pe = parent.get(to);
      edges.push({
        source: from,
        target: to,
        type: pe?.type || 'other',
        label: pe?.label ? (pe.label.en || pe.label.zh || '') : '',
        directed: pe?.directed || false
      });
    }
    return { nodes, edges };
  }

  // ---------------- 向量化（pgvector 语义检索底座） ----------------
  /** 为单个人物写入整人向量 + 多语分块向量（在给定事务连接上执行） */
  private async embedPersonInto(client: pg.PoolClient, person: Person) {
    const emb = await getEmbedder();
    const corpus = personCorpus(person);
    const chunks = buildChunks(person);
    const texts = [corpus, ...chunks.map((c) => c.body)];
    const embs = await emb.embed(texts);

    await client.query('UPDATE persons SET embedding = $1::vector WHERE id = $2', [
      toPgVector(embs[0]),
      person.id
    ]);
    await client.query('DELETE FROM person_chunks WHERE person_id = $1', [person.id]);
    for (let i = 0; i < chunks.length; i++) {
      await client.query(
        `INSERT INTO person_chunks (id, person_id, lang, chunk_type, body, embedding)
         VALUES ($1, $2, $3, $4, $5, $6::vector)`,
        [
          randomUUID(),
          person.id,
          chunks[i].lang,
          chunks[i].type,
          chunks[i].body,
          toPgVector(embs[i + 1])
        ]
      );
    }
  }

  private toSearchHit(p: Person): SearchHit {
    return {
      id: p.id,
      slug: p.slug,
      names: p.names,
      domains: p.domains,
      occupations: p.occupations,
      summary: p.summary,
      trustLevel: p.trustLevel,
      sources: p.sources
    };
  }

  /** 向量（语义）检索：person_chunks 细粒度 + persons 整人向量，合并去重取 Top-K */
  async semanticSearch(query: string, opts: { limit?: number; lang?: string } = {}): Promise<VectorHit[]> {
    const emb = await getEmbedder();
    const [qv] = await emb.embed([query || '']);
    const vec = toPgVector(qv);
    const k = opts.limit ?? 6;

    const chunkRes = await this.pool.query(
      `SELECT c.person_id, 1 - (c.embedding <=> $1::vector) AS score
       FROM person_chunks c
       WHERE c.embedding IS NOT NULL
       ORDER BY c.embedding <=> $1::vector
       LIMIT $2`,
      [vec, k * 2]
    );
    const personRes = await this.pool.query(
      `SELECT p.id, 1 - (p.embedding <=> $1::vector) AS score
       FROM persons p
       WHERE p.embedding IS NOT NULL
       ORDER BY p.embedding <=> $1::vector
       LIMIT $2`,
      [vec, k]
    );

    const best = new Map<string, number>();
    const bump = (id: string, score: number) => {
      const cur = best.get(id);
      if (cur === undefined || score > cur) best.set(id, score);
    };
    for (const r of chunkRes.rows) bump(r.person_id, Number(r.score));
    for (const r of personRes.rows) bump(r.id, Number(r.score));

    const ids = [...best.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map((e) => e[0]);
    const persons = await this.assembleMany(ids);
    return persons.map((p) => ({ hit: this.toSearchHit(p), score: best.get(p.id)! }));
  }

  /** 重算全部向量嵌入（reindex 脚本调用） */
  async reembed(): Promise<void> {
    const { rows } = await this.pool.query('SELECT id FROM persons ORDER BY created_at DESC');
    for (const r of rows) {
      const p = await this.assemblePerson(r.id);
      if (!p) continue;
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await this.embedPersonInto(client, p);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }
    console.log(`[embed] reindexed ${rows.length} persons`);
  }

  // ---------------- UGC 审核 ----------------
  async listByTrust(trust: TrustLevel, limit = 100): Promise<Person[]> {
    const { rows } = await this.pool.query(
      'SELECT id FROM persons WHERE trust_level=$1 ORDER BY created_at DESC LIMIT $2',
      [trust, limit]
    );
    return this.assembleMany(rows.map((r: any) => r.id));
  }

  async setTrustLevel(idOrSlug: string, trust: TrustLevel): Promise<Person | null> {
    const id = await this.resolveId(idOrSlug);
    if (!id) return null;
    await this.pool.query('UPDATE persons SET trust_level=$1, updated_at=now() WHERE id=$2', [trust, id]);
    if (this.neoReady && this.driver) {
      const session = this.driver.session();
      try {
        await session.run('MATCH (p:Person {id:$id}) SET p.trustLevel=$trust', { id, trust });
      } finally {
        await session.close();
      }
    }
    return this.assemblePerson(id);
  }

  async ensureAdmin(email: string, password: string, name = 'Admin'): Promise<void> {
    const { rows } = await this.pool.query('SELECT id, role FROM users WHERE email=$1', [email]);
    if (rows.length) {
      if (rows[0].role !== 'admin') {
        await this.pool.query("UPDATE users SET role='admin' WHERE id=$1", [rows[0].id]);
      }
      return;
    }
    await this.pool.query(
      "INSERT INTO users (id,email,name,role,password_hash,created_at) VALUES ($1,$2,$3,'admin',$4,now())",
      [randomUUID(), email, name, hashPassword(password)]
    );
    console.log(`[seed] admin user ensured: ${email}`);
  }

  // ---------------- PGC 专家背书 ----------------
  async endorsePerson(
    idOrSlug: string, expert: { id: string; name: string }, comment?: string
  ): Promise<Person | null> {
    const id = await this.resolveId(idOrSlug);
    if (!id) return null;
    await this.pool.query(
      `INSERT INTO endorsements (id, person_id, expert_id, expert_name, comment)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (person_id, expert_id)
       DO UPDATE SET expert_name=EXCLUDED.expert_name, comment=EXCLUDED.comment, created_at=now()`,
      [randomUUID(), id, expert.id, expert.name, comment ?? null]
    );
    // 专家背书即权威升级：ugc_verified → pgc（待审/草稿不越级，需先过审）
    await this.pool.query(
      "UPDATE persons SET trust_level='pgc', updated_at=now() WHERE id=$1 AND trust_level='ugc_verified'",
      [id]
    );
    if (this.neoReady && this.driver) {
      const session = this.driver.session();
      try {
        const { rows } = await this.pool.query('SELECT trust_level FROM persons WHERE id=$1', [id]);
        await session.run('MATCH (p:Person {id:$id}) SET p.trustLevel=$trust', { id, trust: rows[0]?.trust_level });
      } finally {
        await session.close();
      }
    }
    return this.assemblePerson(id);
  }

  // ---------------- 用户管理（admin） ----------------
  async listUsers(limit = 200): Promise<PublicUser[]> {
    const { rows } = await this.pool.query(
      'SELECT id, email, name, role FROM users ORDER BY created_at DESC LIMIT $1', [limit]
    );
    return rows as PublicUser[];
  }

  async setUserRole(userId: string, role: 'user' | 'expert' | 'admin'): Promise<PublicUser | null> {
    const { rows } = await this.pool.query(
      'UPDATE users SET role=$1 WHERE id=$2 RETURNING id, email, name, role', [role, userId]
    );
    return (rows[0] as PublicUser) ?? null;
  }

  async getUserById(id: string): Promise<PublicUser | null> {
    const { rows } = await this.pool.query(
      'SELECT id, email, name, role, plan FROM users WHERE id=$1', [id]
    );
    return (rows[0] as PublicUser) ?? null;
  }

  // ---------------- 开放 API 密钥 ----------------
  async createApiKey(userId: string, name: string, plan: 'free' | 'pro'): Promise<ApiKeyCreated> {
    const { key, hash, prefix } = generateApiKey();
    const resetAt = new Date();
    resetAt.setMonth(resetAt.getMonth() + 1);
    const id = randomUUID();
    const quota = QUOTA_BY_PLAN[plan] || QUOTA_BY_PLAN.free;
    await this.pool.query(
      `INSERT INTO api_keys (id, user_id, name, key_hash, prefix, quota_month, used_month, active, reset_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,0,true,$7,now())`,
      [id, userId, name || 'default', hash, prefix, quota, resetAt.toISOString()]
    );
    return {
      key,
      view: {
        id, name: name || 'default', prefix, quotaMonth: quota, usedMonth: 0,
        active: true, resetAt: resetAt.toISOString(), createdAt: new Date().toISOString()
      }
    };
  }

  async listApiKeys(userId: string): Promise<ApiKeyView[]> {
    const { rows } = await this.pool.query(
      `SELECT id, name, prefix, quota_month, used_month, active, reset_at, created_at
       FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC`, [userId]
    );
    return rows.map((r: any) => ({
      id: r.id, name: r.name, prefix: r.prefix,
      quotaMonth: r.quota_month, usedMonth: r.used_month,
      active: r.active, resetAt: new Date(r.reset_at).toISOString(), createdAt: new Date(r.created_at).toISOString()
    }));
  }

  async revokeApiKey(userId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "UPDATE api_keys SET active=false WHERE id=$1 AND user_id=$2 AND active=true", [id, userId]
    );
    return (rowCount ?? 0) > 0;
  }

  async findApiKeyByHash(hash: string): Promise<{
    keyId: string; userId: string; name: string;
    quotaMonth: number; usedMonth: number; resetAt: string; active: boolean;
  } | null> {
    const { rows } = await this.pool.query(
      `SELECT id, user_id, name, quota_month, used_month, active, reset_at
       FROM api_keys WHERE key_hash=$1`, [hash]
    );
    if (rows.length === 0) return null;
    const k = rows[0] as any;
    const now = Date.now();
    if (now >= new Date(k.reset_at).getTime()) {
      k.used_month = 0;
      const d = new Date(k.reset_at);
      while (d.getTime() <= now) d.setMonth(d.getMonth() + 1);
      k.reset_at = d.toISOString();
      await this.pool.query('UPDATE api_keys SET used_month=0, reset_at=$1 WHERE id=$2', [k.reset_at, k.id]);
    }
    return {
      keyId: k.id, userId: k.user_id, name: k.name,
      quotaMonth: k.quota_month, usedMonth: k.used_month,
      resetAt: k.reset_at, active: k.active
    };
  }

  async bumpApiUsage(keyId: string): Promise<void> {
    await this.pool.query('UPDATE api_keys SET used_month = used_month + 1 WHERE id=$1', [keyId]);
  }

  // ---------------- 专业订阅 ----------------
  async subscribe(userId: string, plan: 'free' | 'pro'): Promise<PublicUser | null> {
    const { rows } = await this.pool.query(
      "UPDATE users SET plan=$1 WHERE id=$2 RETURNING id, email, name, role, plan", [plan, userId]
    );
    return (rows[0] as PublicUser) ?? null;
  }

  async setPlan(userId: string, plan: 'free' | 'pro'): Promise<PublicUser | null> {
    const { rows } = await this.pool.query(
      "UPDATE users SET plan=$1 WHERE id=$2 RETURNING id, email, name, role, plan", [plan, userId]
    );
    return (rows[0] as PublicUser) ?? null;
  }

  // ---------------- 登出 / 令牌吊销 ----------------
  async revokeToken(jti: string): Promise<void> {
    this.revoked.add(jti);
  }
  isTokenRevoked(jti: string): boolean {
    return this.revoked.has(jti);
  }

  // ---------------- 管理后台增强（Stage 4：统计 + 审计） ----------------
  async getStats(): Promise<AdminStats> {
    const [pRows, tRows, uRows, rRows, cRows, aRows] = await Promise.all([
      this.pool.query('SELECT count(*)::int AS c FROM persons'),
      this.pool.query('SELECT trust_level, count(*)::int AS c FROM persons GROUP BY trust_level'),
      this.pool.query('SELECT count(*)::int AS c FROM users'),
      this.pool.query('SELECT role, count(*)::int AS c FROM users GROUP BY role'),
      this.pool.query('SELECT count(*)::int AS c FROM comments'),
      this.pool.query('SELECT COALESCE(sum(used_month),0)::int AS c FROM api_keys')
    ]);
    const byTrust: Record<string, number> = {};
    for (const r of tRows.rows) byTrust[r.trust_level] = Number(r.c);
    const byRole: Record<string, number> = {};
    let pro = 0;
    for (const r of rRows.rows) {
      byRole[r.role] = Number(r.c);
      if (r.role === 'pro') pro = Number(r.c);
    }
    // plan 是用户表上的独立列，需单独统计
    const { rows: proRows } = await this.pool.query("SELECT count(*)::int AS c FROM users WHERE plan='pro'");
    pro = Number(proRows[0]?.c || 0);
    return {
      persons: { total: Number(pRows.rows[0].c), byTrust },
      pendingUgc: byTrust['ugc_pending'] || 0,
      users: { total: Number(uRows.rows[0].c), byRole, pro },
      comments: Number(cRows.rows[0].c),
      apiCallsMonth: Number(aRows.rows[0].c)
    };
  }

  async recordAudit(entry: Omit<AuditEntry, 'id' | 'createdAt'>): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_log (id, actor_id, actor_name, action, target_type, target_id, target_label, meta, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      [
        randomUUID(), entry.actorId, entry.actorName, entry.action, entry.targetType,
        entry.targetId, entry.targetLabel ?? null, entry.meta ? JSON.stringify(entry.meta) : null
      ]
    );
  }

  async getAudit(limit = 100): Promise<AuditEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT id, actor_id, actor_name, action, target_type, target_id, target_label, meta, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT $1`, [limit]
    );
    return rows.map((r: any) => ({
      id: r.id, actorId: r.actor_id, actorName: r.actor_name, action: r.action,
      targetType: r.target_type, targetId: r.target_id, targetLabel: r.target_label,
      meta: r.meta, createdAt: new Date(r.created_at).toISOString()
    }));
  }

  // ---------------- 图片上传（已迁出至 uploader 抽象层） ----------------

  // ---------------- 社区评论 ----------------
  async listComments(personId: string): Promise<Comment[]> {
    const { rows } = await this.pool.query(
      `SELECT id, person_id, person_slug, user_id, user_name, body, status, created_at
       FROM comments WHERE person_id=$1 AND status='published' ORDER BY created_at ASC`, [personId]
    );
    return rows.map((r: any) => ({
      id: r.id, personId: r.person_id, personSlug: r.person_slug,
      userId: r.user_id, userName: r.user_name, body: r.body,
      status: r.status, createdAt: new Date(r.created_at).toISOString()
    }));
  }

  async addComment(
    personId: string, personSlug: string, userId: string, userName: string, body: string
  ): Promise<Comment | null> {
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO comments (id, person_id, person_slug, user_id, user_name, body, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,'published',now())`,
      [id, personId, personSlug, userId, userName, body]
    );
    return {
      id, personId, personSlug, userId, userName, body,
      status: 'published', createdAt: new Date().toISOString()
    };
  }
}
