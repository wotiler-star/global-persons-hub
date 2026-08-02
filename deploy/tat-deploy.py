# ============================================================
# tat-deploy.py  —  腾讯云 Lighthouse TAT 部署驱动
# 由本机执行（需 tencentcloud-sdk-python）：
#   1) 读取 deploy/lighthouse-deploy.ps1，做 {{占位符}} 替换后 base64(UTF-8)
#   2) 用 Lighthouse API 按公网 IP 反查实例 ID
#   3) TAT RunCommand (POWERSHELL) 下发并在实例上执行
#   4) 轮询 DescribeInvocationTasks 取回输出（base64 解码）
#   5) CreateFirewallRules 放行 Web 端口
#
# 凭据（不要硬编码，从环境变量读取）：
#   TENCENT_SECRET_ID / TENCENT_SECRET_KEY   —— 需 TAT + Lighthouse + 防火墙权限
#   GPH_PUBLIC_IP    (默认 175.178.23.30)
#   TENCENT_REGION   (默认 ap-guangzhou，需与实例所在地域一致)
#   GPH_WEB_PORT     (默认 3000)
# 依赖本地产物：deploy/dist/shard_info.json（由上传步骤写入）、deploy/.secrets
# ============================================================
import os, sys, time, json, base64

BASE = os.path.dirname(os.path.abspath(__file__))

SECRET_ID  = os.environ.get('TENCENT_SECRET_ID')
SECRET_KEY = os.environ.get('TENCENT_SECRET_KEY')
PUBLIC_IP  = os.environ.get('GPH_PUBLIC_IP', '175.178.23.30')
REGION     = os.environ.get('TENCENT_REGION', 'ap-guangzhou')
WEB_PORT   = int(os.environ.get('GPH_WEB_PORT', '3000'))
RESUME     = '--resume' in sys.argv

if not SECRET_ID or not SECRET_KEY:
    sys.exit('ERROR: 必须设置 TENCENT_SECRET_ID / TENCENT_SECRET_KEY 环境变量')

# ---- 读取分片信息与密钥 ----
try:
    with open(os.path.join(BASE, 'dist', 'shard_info.json'), encoding='utf-8') as f:
        shard = json.load(f)
except FileNotFoundError:
    sys.exit('ERROR: 找不到 deploy/dist/shard_info.json，请先运行上传步骤')

secrets = {}
with open(os.path.join(BASE, '.secrets'), encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or '=' not in line:
            continue
        k, v = line.split('=', 1)
        secrets[k] = v

# ---- 占位符替换 ----
with open(os.path.join(BASE, 'lighthouse-deploy.ps1'), encoding='utf-8') as f:
    script = f.read()

repl = {
    '{{ReleaseBase}}':  shard['release_base'],
    '{{ShardCount}}':   str(shard['shard_count']),
    '{{ExpectedSize}}': str(shard['expected_size']),
    '{{WebPort}}':      str(WEB_PORT),
    '{{SiteUrl}}':      f'http://{PUBLIC_IP}:{WEB_PORT}',
    '{{JwtSecret}}':    secrets['JWT_SECRET'],
    '{{AdminEmail}}':   secrets['GPH_ADMIN_EMAIL'],
    '{{AdminPass}}':    secrets['GPH_ADMIN_PASSWORD'],
}
for k, v in repl.items():
    if k not in script:
        sys.exit(f'ERROR: 占位符 {k} 在脚本中未找到')
    script = script.replace(k, v)

content_b64 = base64.b64encode(script.encode('utf-8')).decode('ascii')
print(f'[ok] 脚本已注入并 base64 编码（长度 {len(content_b64)}）')

# ---- 腾讯云 SDK ----
try:
    from tencentcloud.common import credential
    from tencentcloud.common.profile.client_profile import ClientProfile
    from tencentcloud.common.profile.http_profile import HttpProfile
    from tencentcloud.lighthouse.v20200324 import lighthouse_client, models as lh_models
    from tencentcloud.tat.v20201028 import tat_client, models as tat_models
except ImportError:
    sys.exit('ERROR: 请先安装 tencentcloud-sdk-python：pip install tencentcloud-sdk-python')

cred = credential.Credential(SECRET_ID, SECRET_KEY)
hp = HttpProfile()
hp.reqTimeout = 60
cp = ClientProfile()
cp.httpProfile = hp

# ---- 反查实例 / 下发（支持 --resume 续轮询）----
STATE_FILE = os.path.join(BASE, '.tat_state.json')
if RESUME and os.path.exists(STATE_FILE):
    with open(STATE_FILE, encoding='utf-8') as f:
        st = json.load(f)
    inv_id = st['invocation_id']
    REGION = st['region']
    instance_id = st['instance_id']
    lh_cli = lighthouse_client.LighthouseClient(cred, REGION)
    tat_cli = tat_client.TatClient(cred, REGION)
    print(f'[ok] 恢复轮询 invocation {inv_id}（地域 {REGION}）')
else:
    REGIONS = []
    if os.environ.get('TENCENT_REGION'):
        REGIONS.append(os.environ['TENCENT_REGION'])
    REGIONS += ['ap-guangzhou', 'ap-shanghai', 'ap-beijing', 'ap-chengdu',
                'ap-nanjing', 'ap-hongkong', 'ap-singapore', 'ap-tokyo',
                'ap-seoul', 'ap-bangkok']
    seen = set()
    REGIONS = [r for r in REGIONS if not (r in seen or seen.add(r))]

    instance_id = None
    for region in REGIONS:
        try:
            cli = lighthouse_client.LighthouseClient(cred, region)
            dreq = lh_models.DescribeInstancesRequest()
            dreq.Filters = [{'Name': 'public-ip-address', 'Values': [PUBLIC_IP]}]
            resp = cli.DescribeInstances(dreq)
            if resp.InstanceSet:
                instance_id = resp.InstanceSet[0].InstanceId
                REGION = region
                lh_cli = cli
                break
        except Exception:
            continue
    if not instance_id:
        sys.exit(f'ERROR: 未在任何地域找到公网 IP={PUBLIC_IP} 的 Lighthouse 实例')
    print(f'[ok] 定位实例 {instance_id}（IP {PUBLIC_IP}，地域 {REGION}）')
    tat_cli = tat_client.TatClient(cred, REGION)

    # ---- TAT 下发 ----
    runreq = tat_models.RunCommandRequest()
    runreq.Content = content_b64
    runreq.InstanceIds = [instance_id]
    runreq.Username = 'Administrator'
    runreq.Timeout = 3600
    runreq.CommandType = 'POWERSHELL'
    inv = tat_cli.RunCommand(runreq)
    inv_id = inv.InvocationId
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump({'invocation_id': inv_id, 'region': REGION, 'instance_id': instance_id}, f)
    print(f'[ok] TAT 已下发，InvocationId={inv_id}（状态已存 {os.path.basename(STATE_FILE)}，可用 --resume 续轮询）')

# ---- 轮询任务状态 ----
print('[..] 等待实例执行（构建 API + 拉取分片 + pm2 启动，可能需 5~15 分钟）...')
deadline = time.time() + 30 * 60
last_tail = ''
while time.time() < deadline:
    time.sleep(20)
    tq = tat_models.DescribeInvocationTasksRequest()
    tq.Filters = [{'Name': 'invocation-id', 'Values': [inv_id]}]
    tq.HideOutput = False
    tresp = tat_cli.DescribeInvocationTasks(tq)
    tasks = tresp.InvocationTaskSet or []
    if not tasks:
        continue
    task = tasks[0]
    status = task.TaskStatus
    out = ''
    res = getattr(task, 'TaskResult', None)
    raw = getattr(res, 'Output', None) if res else None
    if raw:
        try:
            out = base64.b64decode(raw).decode('utf-8', 'replace')
        except Exception:
            out = raw
    if out and out != last_tail:
        # 只打印增量，避免刷屏
        newpart = out[len(last_tail):]
        if newpart.strip():
            print(newpart, end='')
        last_tail = out
    if status in ('SUCCESS', 'FAILED', 'TIMEOUT', 'STOPPED'):
        print(f'\n[status] {status}')
        if status != 'SUCCESS':
            sys.exit(f'ERROR: TAT 任务状态 {status}')
        break
else:
    sys.exit('ERROR: 等待 TAT 超时（30 分钟）')

print('\n[ok] 部署脚本执行成功')

# ---- 放行防火墙 ----
try:
    fwreq = lh_models.CreateFirewallRulesRequest()
    fwreq.InstanceId = instance_id
    fwreq.FirewallRules = [{
        'Protocol': 'TCP',
        'Port': str(WEB_PORT),
        'CidrBlock': '0.0.0.0/0',
        'Action': 'ACCEPT',
        'FirewallRuleDescription': 'gph-web',
    }]
    lh_cli.CreateFirewallRules(fwreq)
    print(f'[ok] 防火墙已放行 TCP:{WEB_PORT}')
except Exception as e:
    print(f'[warn] 防火墙放行失败（可手动在控制台添加）：{e}')

# ---- 验证提示 ----
print('\n==== 公网验证（请在本机执行）====')
for path in ['/en', '/en/person/albert-einstein', '/sitemap.xml', '/llms.txt',
             '/api/persons?pageSize=1', '/api/health']:
    print(f'curl -s -o /dev/null -w "%{{http_code}} {path}\\n" http://{PUBLIC_IP}:{WEB_PORT}{path}')
print(f'curl -s http://{PUBLIC_IP}:{WEB_PORT}/api/health')
