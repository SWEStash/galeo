---
title: Garden shed rebuild
status: in progress
owner: Sam
---

# Garden shed rebuild

> [!NOTE]
> This is galeo's live demo. Every tab here is a file held in this page's memory:
> try **Ctrl+E** to edit this one, **Ctrl+Shift+A** to search tabs, or **Ctrl+Shift+P** for every command
> (⌘ for Ctrl on a Mac). Your browser keeps a few keys for itself, such as Ctrl+W and Ctrl+Tab: here, use the
> tab bar for those.

## Goals

- Keep the tools dry through winter
- Room for two bikes and the mower
- Spend under 900 in materials

## Tasks

- [x] Measure the old footprint
- [x] Pick the roof pitch
- [ ] Order the timber (see `materials.csv`)
- [ ] Pour the base
- [ ] Frame the walls
- [ ] Felt and shingle the roof

## Budget

| Item        | Estimate | Spent |
| ----------- | -------: | ----: |
| Timber      |      420 |     0 |
| Roof        |      180 |     0 |
| Base        |      150 |   140 |
| Fixings     |       60 |    25 |
| **Total**   |  **810** | **165** |

## Build order

1. Base, then let it cure for a week.
2. Walls, framed flat and raised one at a time.
3. Roof, from the eaves up.

## Notes

The door goes on the long side, away from the prevailing wind. A cut list:

```python
def cut_list(length_mm, parts):
    """How many boards of length_mm the parts need, first fit."""
    boards = []
    for part in sorted(parts, reverse=True):
        for board in boards:
            if sum(board) + part <= length_mm:
                board.append(part)
                break
        else:
            boards.append([part])
    return boards
```

Questions for the supplier are in the other tabs: the order (`order.json`), the delivery
log (`delivery.log`, still growing), the frame (`frame.md`) and the roof maths (`roof.md`).
