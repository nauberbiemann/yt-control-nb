const fs = require('fs');
const f = 'components/ScriptEngine.tsx';
let c = fs.readFileSync(f, 'utf8');

// Use regex to match variable whitespace
const result = c.replace(
  /(\n\s+<\/div>\n)\n( +)type="button"\n(\s+)onClick=\{processAttachedSrtAssets\}\n(\s+)disabled=\{isProcessingSrtPipeline \|\| isRenderingTextAssets \|\| !externalSrtText\.trim\(\)\}\n(\s+)className="w-full rounded-xl border border-purple-400\/25 bg-purple-500\/10 px-4 py-3 text-\[10px\] font-black uppercase tracking-\[0\.2em\] text-purple-200 transition-all hover:bg-purple-500\/15 disabled:opacity-40 disabled:cursor-not-allowed"\n(\s+)>\n(\s+)\{isProcessingSrtPipeline \? 'PROCESSANDO SRT\.\.\.' : 'PROCESSAR SRT EM ASSETS'\}\n(\s+)<\/button>/,
  (match, divClose, sp) => {
    const indent = sp;
    return `${divClose}                     <button\n                       type="button"\n                       onClick={processAttachedSrtAssets}\n                       disabled={isProcessingSrtPipeline || isRenderingTextAssets || !externalSrtText.trim()}\n                       className="w-full rounded-xl border border-purple-400/25 bg-purple-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-purple-200 transition-all hover:bg-purple-500/15 disabled:opacity-40 disabled:cursor-not-allowed"\n                     >\n                       {isProcessingSrtPipeline ? 'PROCESSANDO SRT...' : 'PROCESSAR SRT EM ASSETS'}\n                     </button>`;
  }
);

if (result !== c) {
  fs.writeFileSync(f, result, 'utf8');
  console.log('SUCCESS');
} else {
  console.log('REGEX DID NOT MATCH');
}
