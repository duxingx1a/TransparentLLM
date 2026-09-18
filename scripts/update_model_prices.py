"""更新模型价格为官方标准价。

数据库连接信息从环境变量 TRANSPARENTLLM_DATABASE_URL 读取；
本地运行时可放在项目根目录的 .env 文件（已被 .gitignore 忽略，不会提交）。
"""
import os
from pathlib import Path


def load_dotenv(path: str = ".env") -> None:
    """极简 .env 加载，仅设置未定义的环境变量。"""
    p = Path(__file__).resolve().parent.parent / path
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


load_dotenv()

DATABASE_URL = os.environ.get("TRANSPARENTLLM_DATABASE_URL")
if not DATABASE_URL:
    raise SystemExit(
        "缺少 TRANSPARENTLLM_DATABASE_URL：请在项目根目录的 .env 中配置后再运行"
    )

import psycopg2

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()

# 更新 GLM-5.3-Flash（dogress）为智谱官方标准价
cur.execute(
    "UPDATE models SET input_price = 0.8, output_price = 2.8, cache_price = 0.23 "
    "WHERE model_name = 'GLM-5.3-Flash' AND provider = 'dogress'"
)
# 更新 Qwen3.8-27B（A100）参考 dogress 同模型价格
cur.execute(
    "UPDATE models SET input_price = 3.0, output_price = 27.0, cache_price = 2.0 "
    "WHERE model_name = 'Qwen3.8-27B' AND provider = 'A100'"
)
conn.commit()

# 验证
cur.execute(
    "SELECT id, model_name, provider, input_price, output_price, cache_price "
    "FROM models WHERE model_name IN ('GLM-5.3-Flash', 'Qwen3.8-27B')"
)
for r in cur.fetchall():
    print(r)

cur.close()
conn.close()
