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

A flowchart with edge labels, line breaks, rounded and cylinder shapes, and a subgraph:

```mermaid
graph TD
  User([User])
  subgraph Services
    Web["Web app<br/>(sign-in)"]
    Api[API]
  end
  Store[(Database)]
  User -->|opens| Web
  Web -->|calls with a token<br/>signed by the app| Api
  Api -.->|reads and writes| Store
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
