# UI 延迟监控（最近 24 次）

> -1 表示超时或异常

## 最近一次检测

| URL | 延迟 (ms) |
|---|---|
| http://jz.***.uy | 888 |
| http://jz.***.io | ❌ |
| http://greenwave1987.***.in | 4539 |
| http://jz.***.xyz | 421 |

## 延迟曲线

```mermaid
xychart-beta
  title "UI Latency (ms)"
  x-axis ["", "15:55:28"]
  y-axis "ms" 0 --> 3000
  line "http://jz.***.uy" [null, 888]
  line "http://jz.***.io" [null, null]
  line "http://greenwave1987.***.in" [null, 4539]
  line "http://jz.***.xyz" [null, 421]
```
