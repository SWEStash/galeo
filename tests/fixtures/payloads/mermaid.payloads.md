```mermaid
graph TD
  A --> B
  click A callback "Tooltip"
  click B call window.eval("window.__galeoPwned='click-call'")
```
%%%
```mermaid
graph TD
  A --> B
  click A "javascript:window.__galeoPwned='click-href'"
```
%%%
```mermaid
graph TD
  A[Docs] --> B
  click A href "https://example.com/" _blank
```
%%%
```mermaid
%%{init: {"securityLevel": "loose", "htmlLabels": true, "flowchart": {"htmlLabels": true}, "secure": []}}%%
graph TD
  A["<img src=x onerror=window.__galeoPwned='init-html'>"] --> B
```
%%%
```mermaid
graph TD
  A["<b onmouseover=window.__galeoPwned='label-hover'>bold</b><img src=x onerror=window.__galeoPwned='label-img'>"] --> B
```
%%%
```mermaid
graph TD
  A[<script>window.__galeoPwned='label-script'</script>] --> B
```
%%%
```mermaid
%%{init: {"themeCSS": "svg { background: url(https://example.com/x.png) }", "fontFamily": "x;} * { background: url(https://example.com/y.png) } {"}}%%
graph TD
  A --> B
```
%%%
```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "url(pwned.png)", "lineColor": "red url(pwned.png)", "fontFamily": "x url(pwned.png)", "background": "url(pwned.png)", "mainBkg": "url(pwned.png)", "nodeBorder": "url(pwned.png)"}}}%%
graph TD
  A --> B
```
%%%
```mermaid
sequenceDiagram
  participant A
  link A: Pwn @ javascript:window.__galeoPwned='actor-link'
  links A: {"Docs": "javascript:window.__galeoPwned='actor-links'"}
  A->>A: hi
```
%%%
```mermaid
graph TD
  E0 --> E1
  E1 --> E2
  E2 --> E3
  E3 --> E4
  E4 --> E5
  E5 --> E6
  E6 --> E7
  E7 --> E8
  E8 --> E9
  E9 --> E10
  E10 --> E11
  E11 --> E12
  E12 --> E13
  E13 --> E14
  E14 --> E15
  E15 --> E16
  E16 --> E17
  E17 --> E18
  E18 --> E19
  E19 --> E20
  E20 --> E21
  E21 --> E22
  E22 --> E23
  E23 --> E24
  E24 --> E25
  E25 --> E26
  E26 --> E27
  E27 --> E28
  E28 --> E29
  E29 --> E30
  E30 --> E31
  E31 --> E32
  E32 --> E33
  E33 --> E34
  E34 --> E35
  E35 --> E36
  E36 --> E37
  E37 --> E38
  E38 --> E39
  E39 --> E40
  E40 --> E41
  E41 --> E42
  E42 --> E43
  E43 --> E44
  E44 --> E45
  E45 --> E46
  E46 --> E47
  E47 --> E48
  E48 --> E49
  E49 --> E50
  E50 --> E51
  E51 --> E52
  E52 --> E53
  E53 --> E54
  E54 --> E55
  E55 --> E56
  E56 --> E57
  E57 --> E58
  E58 --> E59
  E59 --> E60
  E60 --> E61
  E61 --> E62
  E62 --> E63
  E63 --> E64
  E64 --> E65
  E65 --> E66
  E66 --> E67
  E67 --> E68
  E68 --> E69
  E69 --> E70
  E70 --> E71
  E71 --> E72
  E72 --> E73
  E73 --> E74
  E74 --> E75
  E75 --> E76
  E76 --> E77
  E77 --> E78
  E78 --> E79
  E79 --> E80
  E80 --> E81
  E81 --> E82
  E82 --> E83
  E83 --> E84
  E84 --> E85
  E85 --> E86
  E86 --> E87
  E87 --> E88
  E88 --> E89
  E89 --> E90
  E90 --> E91
  E91 --> E92
  E92 --> E93
  E93 --> E94
  E94 --> E95
  E95 --> E96
  E96 --> E97
  E97 --> E98
  E98 --> E99
  E99 --> E100
  E100 --> E101
  E101 --> E102
  E102 --> E103
  E103 --> E104
  E104 --> E105
  E105 --> E106
  E106 --> E107
  E107 --> E108
  E108 --> E109
  E109 --> E110
  E110 --> E111
  E111 --> E112
  E112 --> E113
  E113 --> E114
  E114 --> E115
  E115 --> E116
  E116 --> E117
  E117 --> E118
  E118 --> E119
  E119 --> E120
  E120 --> E121
  E121 --> E122
  E122 --> E123
  E123 --> E124
  E124 --> E125
  E125 --> E126
  E126 --> E127
  E127 --> E128
  E128 --> E129
  E129 --> E130
  E130 --> E131
  E131 --> E132
  E132 --> E133
  E133 --> E134
  E134 --> E135
  E135 --> E136
  E136 --> E137
  E137 --> E138
  E138 --> E139
  E139 --> E140
  E140 --> E141
  E141 --> E142
  E142 --> E143
  E143 --> E144
  E144 --> E145
  E145 --> E146
  E146 --> E147
  E147 --> E148
  E148 --> E149
  E149 --> E150
  E150 --> E151
  E151 --> E152
  E152 --> E153
  E153 --> E154
  E154 --> E155
  E155 --> E156
  E156 --> E157
  E157 --> E158
  E158 --> E159
  E159 --> E160
  E160 --> E161
  E161 --> E162
  E162 --> E163
  E163 --> E164
  E164 --> E165
  E165 --> E166
  E166 --> E167
  E167 --> E168
  E168 --> E169
  E169 --> E170
  E170 --> E171
  E171 --> E172
  E172 --> E173
  E173 --> E174
  E174 --> E175
  E175 --> E176
  E176 --> E177
  E177 --> E178
  E178 --> E179
  E179 --> E180
  E180 --> E181
  E181 --> E182
  E182 --> E183
  E183 --> E184
  E184 --> E185
  E185 --> E186
  E186 --> E187
  E187 --> E188
  E188 --> E189
  E189 --> E190
  E190 --> E191
  E191 --> E192
  E192 --> E193
  E193 --> E194
  E194 --> E195
  E195 --> E196
  E196 --> E197
  E197 --> E198
  E198 --> E199
  E199 --> E200
  E200 --> E201
```
