# UI 延迟监控（最近 24 次）

> -1 表示超时或异常

## 最近一次检测

| URL | 延迟 (ms) |
|---|---|
| http://jz.***.uy | 953 |
| http://jz.***.io | ❌ |
| http://greenwave1987.***.in | 972 |
| http://jz.***.xyz | 529 |

## 延迟曲线

```mermaid
xychart-beta
  title "UI Latency (ms)"
  x-axis ["00:03:09", "00:53:48", "02:46:29", "03:52:23"]
  y-axis "ms" 0 --> 3000
  line "http://jz.***.uy" [928, 949, 885, 953]
  line "http://jz.***.io" [-1, -1, -1, -1]
  line "http://greenwave1987.***.in" [1136, -1, -1, 972]
  line "http://jz.***.xyz" [-1, -1, -1, 529]
```
