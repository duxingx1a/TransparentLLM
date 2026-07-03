#!/usr/bin/env python3
"""批量创建提供商"""
import urllib.request
import json

providers = [
    ('deepseek', 'https://api.deepseek.com', 'sk-YOUR_DEEPSEEK_KEY'),
    ('xiaomi', 'https://api.xiaomimimo.com/v1', 'sk-YOUR_XIAOMI_KEY'),
    ('dogress', 'https://api.do.top/v1', 'sh_YOUR_DOGRESS_KEY'),
    ('A100_nvlink', 'http://183.62.232.28:30022/v1', 'gpustack_YOUR_GPUSTACK_KEY'),
]

for name, api_base, api_key in providers:
    data = json.dumps({'name': name, 'api_base': api_base, 'api_key': api_key}).encode()
    req = urllib.request.Request(
        'http://127.0.0.1/api/providers',
        data=data,
        headers={'Content-Type': 'application/json', 'Authorization': 'Bearer admin'},
        method='POST'
    )
    try:
        resp = urllib.request.urlopen(req)
        result = resp.read().decode()
        print(f'OK  {name}: {resp.status} - {result[:150]}')
    except urllib.error.HTTPError as e:
        print(f'ERR {name}: {e.code} - {e.read().decode()[:200]}')
    except Exception as e:
        print(f'ERR {name}: {e}')
