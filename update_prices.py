#!/usr/bin/env python3
"""更新模型价格"""
import urllib.request, json

req = urllib.request.Request("http://127.0.0.1/api/models", headers={"Authorization": "Bearer admin"})
models = json.loads(urllib.request.urlopen(req).read())["models"]

prices = {
    "deepseek-v4-pro": ("deepseek", 6.0, 12.0, 0.025),
    "deepseek-v4-flash": ("deepseek", 2.0, 4.0, 0.04),
    "mimo-v2.5": ("xiaomi", 1.0, 2.0, 0.02),
    "mimo-v2.5-pro": ("xiaomi", 3.0, 6.0, 0.025),
}

for m in models:
    name = m["model_name"]
    provider = m["provider"]
    if name in prices and provider == prices[name][0]:
        inp, out, cache = prices[name][1:]
        data = json.dumps({"input_price": inp, "output_price": out, "cache_price": cache}).encode()
        url = "http://127.0.0.1/api/models/" + m["id"]
        req2 = urllib.request.Request(url, data=data,
            headers={"Content-Type": "application/json", "Authorization": "Bearer admin"}, method="PUT")
        try:
            urllib.request.urlopen(req2)
            print("OK {}@{} inp={} out={} cache={}".format(name, provider, inp, out, cache))
        except Exception as e:
            print("ERR {}: {}".format(name, e))
