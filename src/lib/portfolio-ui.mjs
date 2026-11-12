
/** Render the same editorial project cards on home and /our-work/. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function sortProjects(projects) {
  return [...projects].sort((a,b) => {
    const ap=a.data.priority ?? 999, bp=b.data.priority ?? 999;
    if(ap!==bp) return ap-bp;
    const ad=a.data.completedAt?.getTime()||0,bd=b.data.completedAt?.getTime()||0;
    if(ad!==bd) return bd-ad;
    return a.data.title.localeCompare(b.data.title);
  });
}
const labels={live:'Live website',concept:'Concept build',archived:'Archived work',
  closed:'Business closed',owned:'In-house product',showcase:'Selected work'};
export function projectCard(project) {
  const d=project.data,slug=escapeHtml(project.id),title=escapeHtml(d.title);
  const category=escapeHtml(d.category||'Website design');
  const status=labels[d.status||'showcase']||labels.showcase;
  const frame=d.image
    ? '<img class="pm-project-picture" src="'+escapeHtml(d.image)+'" alt="'+escapeHtml(d.imageAlt||d.title+' website')+'" loading="lazy">'
    : '<div class="pm-project-art pm-project-art--'+slug+'" aria-label="Stylised project preview (not an actual screenshot)">'+
        '<div class="pm-project-browser"><span></span><span></span><span></span>'+
        '<small>'+category+'</small></div>'+
        '<div class="pm-project-art-title">'+title+'</div>'+
        '<span class="pm-project-art-line"></span><span class="pm-project-art-small"></span>'+
        '</div>';
  return '<article class="pm-project-card">' +
    '<a class="pm-project-cover" href="/our-work/'+slug+'/" aria-label="View '+title+' project">'+frame+'</a>'+
    '<div class="pm-project-content">'+
    '<span class="pm-project-category">'+category+' <span aria-hidden="true">·</span> '+escapeHtml(status)+'</span>'+
    '<h3><a href="/our-work/'+slug+'/">'+title+'</a></h3>'+
    '<p>'+escapeHtml(d.summary)+'</p>'+
    '<div class="pm-project-actions">'+
    '<a class="pm-project-view" href="/our-work/'+slug+'/">Project details <span aria-hidden="true">→</span></a>'+
    (d.website ? '<a class="pm-project-website" href="'+escapeHtml(d.website)+'" target="_blank" rel="noopener noreferrer">Visit website</a>' : '')+
    '</div>'+
    '</div></article>';
}
export function projectCardsHtml(projects) {
  return '<div class="pm-project-grid">'+projects.map(projectCard).join('')+'</div>';
}
