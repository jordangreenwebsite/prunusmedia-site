// Block repeated/missing photos before generating public blog pages.
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const root='src/content/blog'; const images=new Map(); let count=0;
for(const f of readdirSync(root).filter(f=>f.endsWith('.md'))){
 const body=readFileSync(join(root,f),'utf8'); const header=body.split('---')[1];
 if(!body.startsWith('---')||!header)throw new Error('Missing article frontmatter '+f);
 const lines=header.split('\n');const field=key=>{const line=lines.find(l=>l.trim().startsWith(key+':'));if(!line)return '';const v=line.slice(line.indexOf(':')+1).trim();return v.replace(/^["']|["']$/g,'');};
 if(field('draft')==='true')continue;
 const date=Date.parse(field('publishedAt'));if(!Number.isFinite(date))throw new Error('Missing publish date '+f);
 if(date>Date.now())continue;
 const photo=field('image'),alt=field('imageAlt');
 if(!photo||!alt)throw new Error('Article requires photographed cover and honest alt: '+f);
 if(!photo.startsWith('/images/blog/'))throw new Error('Use an optimised local blog photo: '+f);
 const local='public'+photo;
 if(!existsSync(local)||statSync(local).size<8000)throw new Error('Missing/broken local photo '+local);
 if(images.has(photo))throw new Error('Repeated photo on '+f+' and '+images.get(photo));
 images.set(photo,f);count++;
}
console.log('PRUNUS_BLOG_PHOTOS: '+count+' unique local photographed covers passed');
