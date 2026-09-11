import { sanitizeHtml } from '../src/lib/reader/sanitize.ts';
import { normalizeJats } from '../src/lib/reader/jats.ts';
const bad = await sanitizeHtml(`<p>safe</p><script>alert('x')</script><a href="javascript:alert(1)">bad</a><a href="https://example.com">ok</a>`);
if (bad.includes('<script') || bad.includes('javascript:') || bad.includes('alert')) throw new Error('sanitizer failed');
if (!bad.includes('safe') || !bad.includes('https://example.com')) throw new Error('sanitizer removed safe content');
const xml=`<article><front><article-meta><title-group><article-title>Runtime Test</article-title></title-group><contrib-group><contrib><name><given-names>Ada</given-names><surname>Lovelace</surname></name></contrib></contrib-group><pub-date><year>2026</year></pub-date><article-id pub-id-type="doi">10.1234/runtime</article-id><abstract><p>Safe abstract.</p></abstract></article-meta></front><body><sec><title>Methods</title><p>Hello <bold>world</bold>.</p></sec></body></article>`;
const doc=await normalizeJats(xml,{paperId:'doi:10.1234/runtime',providerId:'test'});
if(doc.title!=='Runtime Test' || doc.sections.length<2 || JSON.stringify(doc).includes('<script')) throw new Error('JATS runtime validation failed');
console.log('reader runtime sanitizer/JATS PASS');
