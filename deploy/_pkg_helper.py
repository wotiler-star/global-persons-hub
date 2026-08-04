import os, shutil, zipfile, sys

REPO = r"f:/workbuddy01/全球知名人物志知识库/global-persons-hub"
WEB = os.path.join(REPO, "apps/web")
OUT = os.path.join(REPO, "deploy/dist")
APP = os.path.join(OUT, "app")
SHARD_DIR = os.path.join(OUT, "shards")
STANDALONE = os.path.join(WEB, ".next/standalone")
STATIC_SRC = os.path.join(WEB, ".next/static")
STATIC_DST = os.path.join(STANDALONE, "apps/web/.next/static")
ZIP = os.path.join(OUT, "app.zip")
SHARD_MB = 3

def info(m):
    print(m, flush=True)

# 2. copy static into standalone
if os.path.isdir(STATIC_SRC):
    os.makedirs(STATIC_DST, exist_ok=True)
    for item in os.listdir(STATIC_SRC):
        s = os.path.join(STATIC_SRC, item)
        d = os.path.join(STATIC_DST, item)
        if os.path.isdir(s):
            shutil.copytree(s, d, dirs_exist_ok=True)
        else:
            shutil.copy2(s, d)
    info("static copied into standalone")

# 3. assemble app
if os.path.isdir(APP):
    shutil.rmtree(APP)
os.makedirs(APP, exist_ok=True)
for item in os.listdir(STANDALONE):
    s = os.path.join(STANDALONE, item)
    d = os.path.join(APP, item)
    if os.path.isdir(s):
        shutil.copytree(s, d, dirs_exist_ok=True)
    else:
        shutil.copy2(s, d)
cfg = os.path.join(APP, "apps/api")
os.makedirs(cfg, exist_ok=True)
shutil.copytree(os.path.join(REPO, "apps/api/src"), os.path.join(cfg, "src"), dirs_exist_ok=True)
shutil.copytree(os.path.join(REPO, "apps/api/data"), os.path.join(cfg, "data"), dirs_exist_ok=True)
shutil.copy2(os.path.join(REPO, "apps/api/package.json"), os.path.join(cfg, "package.json"))
ct = os.path.join(APP, "packages/types")
os.makedirs(ct, exist_ok=True)
shutil.copytree(os.path.join(REPO, "packages/types"), ct, dirs_exist_ok=True)
info("app assembled")

# 4. compress
if os.path.exists(ZIP):
    os.remove(ZIP)
with zipfile.ZipFile(ZIP, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(APP):
        for f in files:
            fp = os.path.join(root, f)
            z.write(fp, os.path.relpath(fp, APP))
size = os.path.getsize(ZIP)
info(f"app.zip size = {size} bytes")

# 5. shard
if os.path.isdir(SHARD_DIR):
    shutil.rmtree(SHARD_DIR)
os.makedirs(SHARD_DIR, exist_ok=True)
with open(ZIP, "rb") as fh:
    data = fh.read()
chunk = SHARD_MB * 1024 * 1024
count = (size + chunk - 1) // chunk
for i in range(count):
    part = data[i * chunk:(i + 1) * chunk]
    name = f"part{i:02d}.zip"
    with open(os.path.join(SHARD_DIR, name), "wb") as pf:
        pf.write(part)
info(f"ShardCount = {count}")
info(f"ExpectedSize = {size}")
info("----- deploy shards ready -----")
