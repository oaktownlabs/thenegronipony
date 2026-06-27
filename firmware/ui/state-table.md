# Firmware UI State Table

Status: Draft for Milestone 6.

| Event | From | To | Notes |
| --- | --- | --- | --- |
| Boot complete | `booting` | `idle` | No pour enabled. |
| Recipe selected | `idle` | `recipe_selected` | Recipe data must validate. |
| Pour button pressed | `recipe_selected` | `pouring` | Glass-present detection is not yet specified. |
| Pour complete | `pouring` | `done` | Transition back after display timeout. |
| Timeout | `done` | `idle` | Preserve last recipe if desired. |
| Prime requested | `idle` | `priming` | Service mode. |
| Flush requested | `idle` | `flushing` | Service mode. |
| Fault detected | Any active state | `error` | Stop pumps before display change. |
| Fault cleared | `error` | `idle` | Requires explicit human action. |

