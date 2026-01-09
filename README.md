# UI 延迟监控（最近 24 次）

> -1 表示超时或异常

## 最近一次检测

| URL | 延迟 (ms) |
|---|---|
| http://jz.***.uy | 823 |
| http://jz.***.io | ❌ |
| http://greenwave1987.***.in | ❌ |
| http://jz.***.xyz | 478 |

## 延迟曲线

```mermaid
xychart-beta
  title "UI Latency (ms)"
  x-axis ["16:01:39", "16:15:17"]
  y-axis "ms" 0 --> 3000
  line "http://jz.***.uy" [910, 823]
  line "http://jz.***.io" [null, null]
  line "http://greenwave1987.***.in" [1009, null]
  line "http://jz.***.xyz" [548, 478]
```
