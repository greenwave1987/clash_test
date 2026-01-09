# UI 延迟监控（最近 24 次）

> -1 表示超时或异常

## 最近一次检测

| URL | 延迟 (ms) |
|---|---|
| http://jz.***.uy | 990 |
| http://jz.***.io | ❌ |
| http://greenwave1987.***.in | 845 |
| http://jz.***.xyz | 411 |

## 延迟曲线

```mermaid
xychart-beta
  title "UI Latency (ms)"
  x-axis ["16:01:39", "16:15:17", "16:50:52", "17:15:37", "17:43:41"]
  y-axis "ms" 0 --> 3000
  line "http://jz.***.uy" [910, 823, 903, 975, 990]
  line "http://jz.***.io" [null, null, null, null, null]
  line "http://greenwave1987.***.in" [1009, null, null, 926, 845]
  line "http://jz.***.xyz" [548, 478, null, 467, 411]
```
