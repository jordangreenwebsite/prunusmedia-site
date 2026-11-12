/**
 * Replace the old builder FAQ DOM with native HTML details.
 * Open/close works without any JavaScript, including on iOS Safari.
 * Keep the approved questions and answer HTML from the committed export.
 */
function balancedDiv(source, start) {
  const tokens = /<\/?div\b[^>]*>/gi;
  tokens.lastIndex = start;
  let depth = 0;
  let token;
  while ((token = tokens.exec(source))) {
    if (/^<\/div/i.test(token[0])) {
      depth--;
      if (depth === 0) return { end: tokens.lastIndex, contentEnd: token.index };
    } else {
      depth++;
    }
  }
  throw new Error('Unclosed FAQ div in exported HTML');
}

const faqStart = /<div\b[^>]*class=["'][^"']*\bbde-frequently-asked-questions\b[^"']*["'][^>]*>/gi;
const itemStart = /<div\b[^>]*class=["'][^"']*\bbde-faq__item\b[^"']*["'][^>]*>/gi;
const answerStart = /<div\b[^>]*class=["'][^"']*\bbreakdance-rich-text-styles\b[^"']*["'][^>]*>/i;

function readItems(block, filename) {
  const items = [];
  for (const marker of block.matchAll(itemStart)) {
    const item = block.slice(marker.index, balancedDiv(block, marker.index).end);
    const q = item.match(/<span\s+class=["']bde-faq__title["']>([\s\S]*?)<\/span>/i);
    const a = item.match(answerStart);
    if (!q || !a) throw new Error('FAQ question/answer missing in ' + filename);
    const question = q[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const end = balancedDiv(item, a.index);
    let answer = item.slice(a.index + a[0].length, end.contentEnd).trim();
    // These two exported answers were mistakenly copied from unrelated FAQs.
    // Correct them using the agency's published pricing and service scope.
    if (filename === 'index.html' && question === 'How much does a business website cost in the UK?') {
      answer = '<p>Prunus Media websites start from £995, with ongoing website hosting and care at £99 per month. Our ongoing SEO service costs £195 per month and includes hosting. The final build price depends on the size and requirements of your website. <a href="/pricing/">See our pricing</a> for the details.</p>';
    }
    if (filename === 'index.html' && question === 'Do you build small websites?') {
      answer = '<p>We focus on bespoke websites, typically with ten pages or more. For a smaller trade business website, our <a href="https://uktradewebsites.co.uk/">UK Trade Websites</a> service has simpler packages. If you are unsure which would suit you, we can talk you through the options.</p>';
    }
    if (!question || !answer) throw new Error('Empty FAQ question/answer in ' + filename);
    items.push({ question, answer });
  }
  if (!items.length) throw new Error('FAQ block has no items in ' + filename);
  return items;
}

const chevronDown = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 9 7 7 7-7"/></svg>';
const chevronUp = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 10 7-7 7 7"/><path d="m5 17 7-7 7 7"/></svg>';

export function rebuildLegacyFaqs(source, filename) {
  const blocks = [...source.matchAll(faqStart)];
  if (!blocks.length) return source;
  let html = source;
  for (const match of blocks.reverse()) {
    const end = balancedDiv(source, match.index).end;
    const items = readItems(source.slice(match.index, end), filename);
    if (filename === 'index.html' && items.length !== 6) {
      throw new Error('Expected all six homepage FAQs before replacement');
    }
    const markup = '<div class="pm-faq" aria-label="Frequently asked questions">' +
      items.map(({ question, answer }) =>
        '<details class="pm-faq__item">' +
        '<summary class="pm-faq__question"><span class="pm-faq__title">' +
        question + '</span><span class="pm-faq__icon pm-faq__icon--down">' + chevronDown +
        '</span><span class="pm-faq__icon pm-faq__icon--up">' + chevronUp + '</span></summary>' +
        '<div class="pm-faq__answer"><div class="pm-faq__answer-inner">' + answer +
        '</div></div></details>'
      ).join('') + '</div>';
    html = html.slice(0, match.index) + markup + html.slice(end);
  }
  return html;
}
