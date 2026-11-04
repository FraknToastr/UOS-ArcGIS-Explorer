const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../online/js/app.js'),'utf8');
const context={};vm.createContext(context);
for(const name of ['KIND_COLORS','ROLE_COLORS'])vm.runInContext(code.match(new RegExp(`const ${name} = .*?;`))[0],context);
for(const [name,end] of [['normalizeResourceRoles','explicitResourceRoles'],['explicitResourceRoles','resourceVisible'],['graphNodeColor','graphAppearanceControls']]){
 const start=code.indexOf('function '+name+'('),finish=code.indexOf('function '+end+'(',start);vm.runInContext(code.slice(start,finish),context);
}
const service={kind:'service',type:'Feature Service',meta:{type:'Feature Service',typeKeywords:['ArcGIS Server','Feature Service','Metadata','Data']}},layer={kind:'layer',type:'Layer',meta:{hasMetadata:true}},metadata={kind:'other',type:'Metadata Document',meta:{}},system={kind:'layer',roles:['basemap']};
assert.deepEqual(Array.from(context.explicitResourceRoles(service)),[],'Metadata capability must not recolour or hide a service');
assert.equal(context.graphNodeColor(service),'var(--graph-service)');
assert.equal(context.graphNodeColor(layer),'var(--graph-layer)');
assert.equal(context.graphNodeColor(metadata),'var(--graph-metadata)');
assert.equal(context.graphNodeColor(system),'var(--graph-system)');
assert.equal(context.graphNodeColor({...system,roles:[' Operational ',' BASEMAP ']}),'var(--graph-system)');
assert.equal(context.graphNodeColor({...service,meta:{isSystemLayer:true}}),'var(--graph-system)');
assert.equal(context.graphNodeColor({...service,meta:{isMetadata:true}}),'var(--graph-metadata)');
const css=fs.readFileSync(path.join(__dirname,'../online/styles.css'),'utf8');
for(const name of ['service','system','metadata'])assert.match(css,new RegExp(`--graph-${name}:#[0-9a-f]{6}`));
console.log('PASS graph colours: ordinary service metadata capability, genuine metadata, basemap/system precedence, and shared palette tokens');
