// Read-only admin MCP interface for the website-client portal.
// Disabled unless a dedicated MCP_ADMIN_TOKEN is provisioned. No client PII,
// lead messages, uploaded files, editor drafts, or mutation tools are exposed.
// Implements stateless Streamable HTTP JSON responses for current MCP clients.
import { allowedClient, getGscMetrics } from './gsc.js';
const MCP_VERSION='2026-07-28';
const respond=(payload,status=200,headers={})=>new Response(payload===null?null:JSON.stringify(payload),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',
    'x-content-type-options':'nosniff','access-control-allow-origin':'null',...headers}
});
const error=(id,code,message)=>({jsonrpc:'2.0',id, error:{code,message}});
const ok=(id,result)=>({jsonrpc:'2.0',id,result});
const stringify=(value)=>[{type:'text',text:JSON.stringify(value)}];
const definitions=[
  {name:'list_clients',description:'List active client names, industry, site domains and configured GSC properties. Never returns lead contact details.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},readOnlyHint:true},
  {name:'get_search_performance',description:'Get measured Search Console clicks, impressions and search queries for one registered client with an approved property.',
    inputSchema:{type:'object',properties:{client_id:{type:'string',description:'Exact client UUID'}} ,required:['client_id'],additionalProperties:false},readOnlyHint:true},
  {name:'get_editorial_plan',description:'List article titles, statuses and scheduled dates for a client. Never returns private drafts or uploaded material.',
    inputSchema:{type:'object',properties:{client_id:{type:'string'}},required:['client_id'],additionalProperties:false},readOnlyHint:true},
  {name:'get_research_queue',description:'Show pending/working research tasks, discovered source candidate URLs and their unverified status.',
    inputSchema:{type:'object',properties:{client_id:{type:'string'}},required:['client_id'],additionalProperties:false},readOnlyHint:true}
].map(d=>({name:d.name,description:d.description,inputSchema:d.inputSchema,annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}}));
function eqToken(a,b){
  if(typeof a!=='string'||typeof b!=='string'||!a||!b||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
async function authorised(request,env){
  const auth=request.headers.get('authorization')||'';
  if(!/^Bearer [a-zA-Z0-9._~-]{48,256}$/.test(auth))return false;
  return eqToken(auth.slice(7),env.MCP_ADMIN_TOKEN||'');
}
function clientArg(args){
  return typeof args?.client_id==='string'&&/^[a-f0-9-]{36}$/.test(args.client_id)?args.client_id:'';
}
async function toolCall(env,name,args){
  if(name==='list_clients'){
    const rows=(await env.DB.prepare(
      "SELECT id,name,domain,industry,service_area,gsc_property FROM clients WHERE active=1 ORDER BY name LIMIT 200"
    ).all()).results;
    return {clients:rows};
  }
  const clientId=clientArg(args);
  if(!clientId)return {error:'A valid client_id UUID is required.',isError:true};
  const client=await allowedClient(env,{admin:true,email:'mcp-readonly@prunusmedia.com'},clientId);
  if(!client)return {error:'Client not found.',isError:true};
  if(name==='get_search_performance'){
    try{return await getGscMetrics(env,client);}
    catch{return {error:'Search Console access failed. Check the approved property and service account.',isError:true};}
  }
  if(name==='get_editorial_plan'){
    const posts=(await env.DB.prepare(
      'SELECT id,title,status,scheduled_at,created_at FROM editorial_posts WHERE client_id=? ORDER BY created_at DESC LIMIT 100'
    ).bind(clientId).all()).results;
    return {client_id:clientId,posts};
  }
  if(name==='get_research_queue'){
    const jobs=(await env.DB.prepare(
      'SELECT id,week_start,status,discovery_query,candidate_sources_json FROM research_jobs WHERE client_id=? ORDER BY week_start DESC LIMIT 100'
    ).bind(clientId).all()).results;
    return {client_id:clientId,jobs:jobs.map(x=>({id:x.id,week_start:x.week_start,status:x.status,
      query:x.discovery_query||'',candidates:JSON.parse(x.candidate_sources_json||'[]')}))};
  }
  return {error:'Unknown tool.',isError:true};
}
export async function mcpHandler(request,env){
  if(!env.MCP_ADMIN_TOKEN)return respond({error:'MCP is not activated.'},503);
  const url=new URL(request.url);
  const origin=request.headers.get('origin');
  if(origin&&origin!==url.origin)return respond({error:'Origin denied.'},403);
  if(request.method!=='POST')return new Response(null,{status:405,headers:{allow:'POST','cache-control':'no-store'}});
  if(!(await authorised(request,env)))return respond({error:'Unauthorised.'},401,{'www-authenticate':'Bearer'});
  const accept=request.headers.get('accept')||'';
  if(!accept.includes('application/json')||!accept.includes('text/event-stream'))return respond({error:'Accept application/json and text/event-stream.'},406);
  const contentType=request.headers.get('content-type')||'';
  if(!contentType.startsWith('application/json'))return respond({error:'JSON required.'},415);
  const version=request.headers.get('mcp-protocol-version');
  if(version&&version!==MCP_VERSION&&version!=='2025-06-18')return respond({error:'Unsupported MCP version.'},400);
  let body;
  try{
    const raw=await request.text();
    if(raw.length>16000)return respond({error:'Request too large.'},413);
    body=JSON.parse(raw);
    if(!body||Array.isArray(body)||body.jsonrpc!=='2.0'||typeof body.method!=='string')throw Error('invalid');
  }catch{return respond(error(null,-32700,'Invalid JSON-RPC request.'),400);}
  const id=body.id??null;
  if(version===MCP_VERSION){
    if(request.headers.get('mcp-method')!==body.method)return respond(error(id,-32600,'Mcp-Method header does not match request.'),400);
    if(body.method==='tools/call'&&request.headers.get('mcp-name')!==body.params?.name)
      return respond(error(id,-32600,'Mcp-Name header does not match tool.'),400);
  }
  if(body.method.startsWith('notifications/'))return new Response(null,{status:202,headers:{'cache-control':'no-store'}});
  if(id===null)return respond(error(null,-32600,'JSON-RPC request id is required.'),400);
  if(body.method==='initialize'){
    const result={protocolVersion:version||'2025-06-18',capabilities:{tools:{listChanged:false}},
      serverInfo:{name:'prunus-website-portal',version:'1.0.0'}};
    return respond(ok(id,result));
  }
  if(body.method==='ping')return respond(ok(id,{}));
  if(body.method==='tools/list')return respond(ok(id,{tools:definitions}));
  if(body.method!=='tools/call')return respond(error(id,-32601,'Unknown method.'));
  const name=body.params?.name;
  if(!definitions.some(d=>d.name===name))return respond(error(id,-32602,'Unknown tool name.'));
  const args=body.params?.arguments||{};
  if(!args||typeof args!=='object'||Array.isArray(args))return respond(error(id,-32602,'Arguments must be an object.'));
  try{
    const result=await toolCall(env,name,args);
    const isError=result.isError===true;
    return respond(ok(id,{content:stringify(isError?{error:result.error}:result),isError}));
  }catch{
    return respond(ok(id,{content:stringify({error:'Tool temporarily unavailable.'}),isError:true}));
  }
}
