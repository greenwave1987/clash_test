# UI 延迟监控（最近 24 次）

> -1 表示超时或异常

## 最近一次检测

| URL | 延迟 (ms) |
|---|---|
| http://jz.***.uy | 901 |
| http://jz.***.io | ❌ |
| http://greenwave1987.***.in | 1187 |
| http://jz.***.xyz | 550 |

## 延迟曲线

```mermaid
xychart-beta
  title "UI Latency (ms)"
  x-axis ["16:01:39", "16:15:17", "16:50:52", "17:15:37", "17:43:41", "18:17:48", "18:52:35", "19:12:54", "19:37:36", "20:14:01", "20:43:15", "21:11:47"]
  y-axis "ms" 0 --> 3000
  line "http://jz.***.uy" [910, 823, 903, 975, 990, 825, 890, 961, 909, null, 950, 901]
  line "http://jz.***.io" [null, null, null, null, null, 658, null, null, null, null, null, null]
  line "http://greenwave1987.***.in" [1009, null, null, 926, 845, null, 1140, null, 992, 1096, 860, 1187]
  line "http://jz.***.xyz" [548, 478, null, 467, 411, null, 556, 482, 566, 708, 474, 550]
```
