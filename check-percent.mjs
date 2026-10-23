import { ChmFile, chmReaderFromFile } from 'chmlib-ts';

const chmPath = '/home/mutton/repo/chm-viewer/OakStreamCrb.chm';
const reader = chmReaderFromFile(chmPath);
const chm = await ChmFile.open(reader);

let percentCount = 0;
for await (const entry of chm.enumerate()) {
    if (entry.path.includes('%')) {
        console.log(' ', entry.path);
        percentCount++;
    }
}
console.log('Total files with %:', percentCount);

// Test decodeURIComponent edge cases
const testPaths = [
    '/100%.html',
    '/file%20name.html',
    '/file%zz.html',  // invalid hex
    '/normal.html',
    '/file+name.html', // + is not decoded by decodeURIComponent
];

console.log('\n=== decodeURIComponent edge cases ===');
for (const p of testPaths) {
    try {
        const decoded = decodeURIComponent(p);
        console.log(`  "${p}" → "${decoded}" ✓`);
    } catch (e) {
        console.log(`  "${p}" → ERROR: ${e.message}`);
    }
}

chm.close();
