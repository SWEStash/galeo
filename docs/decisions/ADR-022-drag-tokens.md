# ADR-022 — A tab drag carries a single-use token, not the tab id

- Status: Accepted (2026-10-20, owner); the token's origin revised the same day, before it was built (owner),
  see [Revision](#revision-2026-10-20)
- Date: 2026-10-20
- Deciders: project owner
- Supersedes: point 1 of [ADR-019](ADR-019-moving-tabs-between-windows.md), and the part of its point 3
  that names what a drop claims. The rest of ADR-019 stands.
- Builds on: [ADR-004](ADR-004-security-and-zero-network.md) (capabilities main sees itself), SR-11 and SR-12
  in the [threat model](../security/threat-model.md).

## Context

ADR-019 puts the tab id in the drag (`application/x-galeo-tab`), and the window under the drop claims the
pending drag with `tabs.adopt(id, position)`. Main checks that the id is the pending drag's tab and that it
comes from another window. That was meant to let a page take only a tab the reader is dragging.

The v0.3 pre-release security review found that the id proves less than that. A tab keeps its id for life,
across moves, so a window that once held the tab knows its id. If that window's page is compromised (T1),
it can call `tabs.adopt(id, …)` while the reader drags the tab in any other window, and take it with its
edit grant and unsaved text. The drop the reader made, if any, then finds nothing to claim. It needs a compromised renderer, so it is Low, but it breaks the claim ADR-019
makes, and the fix is small.

## Decision

1. **Each drag has a token.** When a drag starts, the source page makes a random token (`crypto.randomUUID()`,
   122 random bits) and registers it with main in `tabs.dragStart(id, token)`. Main accepts it only with a
   drag it allows (ADR-019 point 2: a tab of that window, real input), keeps it with the pending drag, and
   forgets it when the drag ends, is claimed or runs out. A token is never accepted twice.
2. **The drag carries the token**, in the type `application/x-galeo-tab` only, never `text/plain`. Only a
   window the reader drags over gets it, from the drop's data.
3. **A drop claims by token.** The window under the drop asks `tabs.adopt(token, position)`. Main moves the
   tab only for the pending drag's token, from another window, once. A tab id is no longer a claim: a page
   that knows one learns nothing it can use.

The source still names its own tab in `tabs.dragEnd(id, outside)`: main checks it against the source's
own pending drag, as before. Points 2 and 4–10 of ADR-019 (one pending drag, real input to start it, the
500 ms settle, tear-off by main, what travels with the tab) are unchanged.

## Options considered

| Option | For | Against |
|---|---|---|
| **A token per drag, made by the source page, in the drag (chosen)** | Only a window the reader drags over can claim; nothing to learn ahead of time; drag data is set at once, as the browser requires | The source page picks the token: that gains it nothing, it can already move its own tab with the palette |
| A token per drag from main (first version of this ADR) | Main makes the secret | Drag data can only be set synchronously in `dragstart`, before main can answer: not buildable |
| Keep the id; accept the risk | No change | A compromised page in a window that once held the tab can take it during any drag |
| Keep the id; main also checks the drop window is under the pointer | Ties the claim to the drop | Wayland gives main no pointer position or window positions (ADR-019 spike) |
| Tie the claim to a fresh input credit in the destination | Uses SR-12 | A drop on Wayland gives the destination no trusted input main sees before the adopt |

## Consequences

- `tabs.dragStart` takes the token too; `tabs.adopt` takes the token instead of the id. The zod schemas
  check the token's shape (a UUID).
- Pages that never took part in a drag can't claim it, whatever ids they know.
- The e2e drag tests take the token from the source's real `dragstart` and drop it in the destination.

## Revisit triggers

- A compositor gives main the drop window or pointer position: a claim could also be checked there.
- Tabs move by some path other than drag and the palette.

## Revision (2026-10-20)

As first accepted, main made the token and answered it from `tabs.dragStart`. Building it showed the page
can only put data in a drag synchronously, inside `dragstart`, so a token from main would arrive too late.
The source page now makes the token and registers it with main (points 1 and 2 above). What a claim needs,
and who can make one, is unchanged.
