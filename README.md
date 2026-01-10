# UI 延迟监控（最近 24 次）

> -1 表示超时或异常

## 最近一次检测

| URL | 延迟 (ms) |
|---|---|
| http://jz.***.uy | 928 |
| http://jz.***.io | ❌ |
| http://greenwave1987.***.in | 1136 |
| http://jz.***.xyz | ❌ |

## 延迟曲线

```mermaid
xychart-beta
  title "UI Latency (ms)"
  x-axis ["00:03:09"]
  y-axis "ms" 0 --> 3000
  line "http://jz.***.uy" [928]
  line "http://jz.***.io" [-1]
  line "http://greenwave1987.***.in" [1136]
  line "http://jz.***.xyz" [-1]
```
