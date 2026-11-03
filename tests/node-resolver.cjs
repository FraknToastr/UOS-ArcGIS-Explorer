/* Developer-test resolver: explicit package path, never a blanket NODE_PATH. */
if(process.env.REVIEW_PLAYWRIGHT){
  const Module=require('node:module'),resolve=Module._resolveFilename;
  Module._resolveFilename=function(name,...args){
    return resolve.call(this,name==='playwright'?process.env.REVIEW_PLAYWRIGHT:name,...args);
  };
}
