# 代理 TCP 延迟监控（最近 3 次）

- 测量：TCP connect 延迟
- 单位：ms
- -1 表示连接失败或超时

## 最近一次检测

| 代理 | 延迟 |
|---|---|
| http://jz.***.uy:19873 | ❌ |
| http://jz.***.io:19873 | ❌ |
| http://greenwave1987.***.in:19873 | ❌ |
| http://jz.***.xyz:19873 | ❌ |

## 延迟曲线

```mermaid
xychart-beta
  title "Proxy TCP Latency (ms)"
  x-axis ["05:30:45", "06:38:01", "06:40:54"]
  y-axis "ms" 0 --> 3000
  line "http://jz.***.uy" [-1, -1, -1]
  line "http://jz.***.io" [-1, -1, -1]
  line "http://greenwave1987.***.in" [-1, -1, -1]
  line "http://jz.***.xyz" [-1, -1, -1]
```
