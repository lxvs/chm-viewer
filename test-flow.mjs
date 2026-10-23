import { ChmFile, chmReaderFromFile, parseSystemInfo, parseToc } from 'chmlib-ts';

const chmPath = '/home/mutton/repo/chm-viewer/OakStreamCrb.chm';
const reader = chmReaderFromFile(chmPath);
const chm = await ChmFile.open(reader);

// Simulate getFileContent with URL decoding
async function getFileContent(filePath) {
    let normalized;
    try {
        normalized = decodeURIComponent(filePath.replace(/\\/g, '/'));
    } catch (e) {
        return { found: false, error: 'decode failed: ' + e.message };
    }
    if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
    }
    normalized = normalized.split('#')[0].split('?')[0];
    try {
        const ui = await chm.resolve(normalized);
        if (!ui) return { found: false, normalized };
        const data = await chm.retrieve(ui);
        return { found: true, normalized, size: data.length };
    } catch (e) {
        return { found: false, normalized, error: e.message };
    }
}

// Simulate resolvePath from main.js
function resolvePath(href, basePath) {
    let path = href.split('#')[0].split('?')[0];
    if (!path) return href;
    if (path.startsWith('/')) return path;
    const baseDir = basePath.substring(0, basePath.lastIndexOf('/') + 1);
    const resolved = baseDir + path;
    const parts = resolved.split('/');
    const stack = [];
    for (const part of parts) {
        if (part === '.') continue;
        if (part === '') continue;
        if (part === '..') {
            stack.pop();
        } else {
            stack.push(part);
        }
    }
    return '/' + stack.join('/');
}

// Test 1: Images on index.html
console.log('=== Test 1: Images on index.html ===');
const indexUi = await chm.resolve('/index.html');
const indexData = await chm.retrieve(indexUi);
const indexHtml = new TextDecoder('utf-8').decode(indexData);
const imgSrcs = [...indexHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
for (const src of imgSrcs) {
    const resolved = resolvePath(src, '/index.html');
    const result = await getFileContent(resolved);
    console.log(`  src="${src}" → resolved="${resolved}" → found=${result.found}${result.error ? ' ERROR: ' + result.error : ''}${result.size ? ` (${result.size} bytes)` : ''}`);
}

// Test 2: Release Notes and Porting Notes links
console.log('\n=== Test 2: Link resolution ===');
const testPaths = [
    '/Release%20Notes.htm',
    '/Porting%20Notes.htm',
    '/Release Notes.htm',
    '/Porting Notes.htm',
];
for (const path of testPaths) {
    const result = await getFileContent(path);
    console.log(`  path="${path}" → found=${result.found}${result.size ? ` (${result.size} bytes)` : ''}`);
}

// Test 3: Resolve links from index.html the way processLinks does
console.log('\n=== Test 3: Link resolution from index.html ===');
const linkHrefs = [...indexHtml.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map(m => m[1]);
for (const href of linkHrefs) {
    if (href.startsWith('http')) continue;
    const resolved = resolvePath(href, '/index.html');
    const result = await getFileContent(resolved);
    console.log(`  href="${href}" → resolved="${resolved}" → found=${result.found}${result.size ? ` (${result.size} bytes)` : ''}`);
}

// Test 4: Check TOC local values
console.log('\n=== Test 4: TOC local values (sample) ===');
const sysRaw = await chm.getSystemRaw();
const sys = parseSystemInfo(sysRaw);
const tocUi = await chm.resolve('/index.hhc');
if (tocUi) {
    const tocData = await chm.retrieve(tocUi);
    const tocHtml = new TextDecoder('utf-8').decode(tocData);
    const toc = parseToc(tocHtml);
    const printEntry = (entry, depth) => {
        if (depth < 2) {
            console.log(`  ${'  '.repeat(depth)}${entry.name} -> "${entry.local}"`);
            if (entry.children) {
                entry.children.forEach(c => printEntry(c, depth + 1));
            }
        }
    };
    toc.entries.slice(0, 3).forEach(e => printEntry(e, 0));
}

chm.close();
