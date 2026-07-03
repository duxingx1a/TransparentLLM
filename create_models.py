#!/usr/bin/env python3
"""批量创建模型 — 价格参考硅基流动"""
import urllib.request, json

# 价格参考硅基流动 https://siliconflow.cn/pricing
models = [
    # deepseek (api: https://api.deepseek.com)
    ('deepseek-v4-flash', 'deepseek', 'https://api.deepseek.com', 1.00, 2.00, 0.02),
    ('deepseek-v4-pro', 'deepseek', 'https://api.deepseek.com', 12.00, 24.00, 0.10),
    # xiaomi mimo (硅基无，按同类估计)
    ('mimo-v2.5', 'xiaomi', 'https://api.xiaomimimo.com/v1', 1.00, 4.00, 0.20),
    ('mimo-v2.5-pro', 'xiaomi', 'https://api.xiaomimimo.com/v1', 2.00, 8.00, 0.50),
    # dogress (硅基价格)
    ('Qwen3.6-27B', 'dogress', 'https://api.do.top/v1', 1.50, 6.00, 0.50),
    ('GLM-5.2', 'dogress', 'https://api.do.top/v1', 8.00, 28.00, 2.00),
    # A100_nvlink
    ('GLM-5.2', 'A100_nvlink', 'http://183.62.232.28:30022/v1', 8.00, 28.00, 2.00),
]

for name, provider, api_base, inp, out, cache in models:
    data = json.dumps({
        'model_name': name,
        'provider': provider,
        'api_base': api_base,
        'api_key': 'auto-from-provider',
        'input_price': inp,
        'output_price': out,
        'cache_price': cache,
    }).encode()
    req = urllib.request.Request(
        'http://127.0.0.1/api/models',
        data=data,
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer admin'},
        method='POST'
    )
    try:
        resp = urllib.request.urlopen(req)
        print(f'OK  {name:25s} ({provider:12s}) inp=¥{inp} out=¥{out} cache=¥{cache}')
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:200]
        print(f'ERR {name:25s} ({provider:12s}) {e.code}: {body}')
    except Exception as e:
        print(f'ERR {name}: {e}')
