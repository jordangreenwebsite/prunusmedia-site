// Validate website *hostnames* at the server boundary, accepting a pasted home URL.
// Never accept credentials, ports, local hosts, IPs or paths masquerading as domains.
// Preserve the www prefix: it may be the configured production website host.
export function normalizeWebsiteDomain(input){
  if(typeof input!=='string')return {domain:'',error:'Enter the website domain or homepage URL.'};
  const entered=input.trim();
  if(!entered)return {domain:'',error:'Enter the website domain or homepage URL.'};
  if(entered.length>500)return {domain:'',error:'Website address is too long.'};
  let candidate=entered;
  if(!/^https?:\/\//i.test(candidate)){
    if(candidate.includes('://')||candidate.startsWith('//'))
      return {domain:'',error:'Use a website beginning with http:// or https://, or enter its domain only.'};
    candidate='https://'+candidate;
  }
  let url;
  try{url=new URL(candidate);}catch{return {domain:'',error:'Enter a valid website domain, such as www.example.co.uk.'};}
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)
    return {domain:'',error:'Enter a normal public website address without login details or a port.'};
  if(url.pathname!=='/'||url.search||url.hash)
    return {domain:'',error:'Enter the homepage address only, without a page path, query or #section.'};
  const domain=url.hostname.replace(/\.$/,'').toLowerCase();
  if(domain.length>253||!domain.includes('.')||/\s/.test(domain))
    return {domain:'',error:'Enter a public website domain, such as www.example.co.uk.'};
  const labels=domain.split('.');
  if(labels.some(part=>part.length<1||part.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))||
    !/^[a-z]{2,63}$/.test(labels[labels.length-1])||
    domain==='localhost'||domain.endsWith('.localhost'))
    return {domain:'',error:'Enter a public website domain, such as www.example.co.uk.'};
  return {domain,error:null};
}
