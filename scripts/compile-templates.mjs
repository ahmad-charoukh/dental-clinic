import fs from 'node:fs';
import nunjucks from 'nunjucks';
const templates={};
let out='const window={nunjucksPrecompiled:{}};\n';
for(const name of fs.readdirSync('app/templates').filter(x=>x.endsWith('.html'))){
 const src=fs.readFileSync('app/templates/'+name,'utf8').replace(/\[:(\d+)\]/g,'|prefix($1)').replace(/\.startswith\(/g,'.startsWith(').replace(/if (not )?(cases|articles|reviews|faqs|media) %}/g,(_,not,list)=>'if '+(not||'')+list+'|length %}');
 out+=nunjucks.precompileString(src,{name});
}
fs.writeFileSync('cloudflare/templates.mjs',out+'\nexport default window.nunjucksPrecompiled;\n');
