import { ChmFile, chmReaderFromFile } from 'chmlib-ts';

const chmPath = '/home/mutton/repo/chm-viewer/OakStreamCrb.chm';
const reader = chmReaderFromFile(chmPath);
const chm = await ChmFile.open(reader);

// Check for Release Notes and Porting Notes
console.log('=== Looking for Release/Porting Notes ===');
for await (const entry of chm.enumerate()) {
    const lower = entry.path.toLowerCase();
    if (lower.includes('release') || lower.includes('porting')) {
        console.log(' ', entry.path);
    }
}

// Check image references in index.html
console.log('\n=== Image references in index.html ===');
const indexUi = await chm.resolve('/index.html');
const indexData = await chm.retrieve(indexUi);
const indexHtml = new TextDecoder('utf-8').decode(indexData);
const imgMatches = indexHtml.match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
imgMatches.forEach(m => {
    const srcMatch = m.match(/src=["']([^"']+)["']/i);
    if (srcMatch) console.log('  img src:', srcMatch[1]);
});

// Check link references in index.html
console.log('\n=== Link references in index.html ===');
const linkMatches = indexHtml.match(/<a[^>]+href=["']([^"']+)["']/gi) || [];
linkMatches.forEach(m => {
    const hrefMatch = m.match(/href=["']([^"']+)["']/i);
    if (hrefMatch) console.log('  a href:', hrefMatch[1]);
});

// List some files with spaces or special chars
console.log('\n=== Files with spaces (first 10) ===');
let spaceCount = 0;
for await (const entry of chm.enumerate()) {
    if (entry.path.includes(' ') && spaceCount < 10) {
        console.log(' ', entry.path);
        spaceCount++;
    }
}
console.log('Total files with spaces:', spaceCount === 10 ? '10+' : spaceCount);

// List image files
console.log('\n=== Image files (first 10) ===');
let imgCount = 0;
for await (const entry of chm.enumerate()) {
    if (entry.path.match(/\.(png|gif|jpg|jpeg|bmp|ico|svg)$/i) && imgCount < 10) {
        console.log(' ', entry.path);
        imgCount++;
    }
}

chm.close();
