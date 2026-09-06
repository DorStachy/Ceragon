const http=require('http'),fs=require('fs'),path=require('path');
const dir=__dirname;
http.createServer((req,res)=>{
  const f=path.join(dir, decodeURIComponent(req.url.split('?')[0]).replace(/^\//,'') || 'panels.html');
  fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end('nf');return;} res.writeHead(200,{'content-type':f.endsWith('.html')?'text/html; charset=utf-8':'application/json'}); res.end(b); });
}).listen(8791,'127.0.0.1',()=>console.log('up'));
