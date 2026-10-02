# Diagrams

A flowchart with an accessible title:

```mermaid
flowchart LR
  accTitle: Checkout flow
  accDescr: From the cart to the confirmation
  Cart --> Pay --> Done
```

A sequence:

```mermaid
sequenceDiagram
  Alice->>Bob: Hello
  Bob-->>Alice: Hi
```

A pie chart:

```mermaid
pie title Pets
  "Dogs" : 3
  "Cats" : 2
```

A class diagram:

```mermaid
classDiagram
  Animal <|-- Dog
```

A state diagram:

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> [*]
```

One that can't be drawn:

```mermaid
graph TD
  A --> B -->
```

Plain code stays highlighted:

```ts
const answer = 42;
```
