const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const ts = require("typescript");

const filename = path.join(__dirname, "../components/chat/SafeRichText.tsx");
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: filename,
}).outputText;
const componentModule = { exports: {} };
new Function("require", "module", "exports", compiled)(require, componentModule, componentModule.exports);
const { SafeRichText } = componentModule.exports;

const html = renderToStaticMarkup(
  React.createElement(SafeRichText, {
    content: [
      "**Servizi disponibili** e `supporto`",
      "",
      "- [Prenota](https://cliente.example/prenota)",
      "- [Non sicuro](javascript:alert(1))",
      "- <img src=x onerror=alert(1)>",
    ].join("\n"),
  }),
);

assert.match(html, /<strong[^>]*>Servizi disponibili<\/strong>/, "Il grassetto non viene renderizzato");
assert.match(html, /<code[^>]*>supporto<\/code>/, "Il codice inline non viene renderizzato");
assert.match(html, /<ul[^>]*>/, "L'elenco non viene renderizzato");
assert.match(html, /href="https:\/\/cliente\.example\/prenota"/, "Il link HTTPS valido non viene renderizzato");
assert.doesNotMatch(html, /href="javascript:/i, "Un protocollo pericoloso è diventato cliccabile");
assert.doesNotMatch(html, /<img/i, "L'HTML non attendibile è stato interpretato");
assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/, "L'HTML non attendibile non resta testo visibile");

console.log(JSON.stringify({ success: true, checks: 7 }, null, 2));
