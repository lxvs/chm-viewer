import { ChmFile, chmReaderFromFile } from 'chmlib-ts';

const chmPath = '/home/mutton/repo/chm-viewer/OakStreamCrb.chm';
const reader = chmReaderFromFile(chmPath);
const chm = await ChmFile.open(reader);

// Find image files with spaces or special characters
console.log('=== Image files with spaces ===');
for await (const entry of chm.enumerate()) {
    if (entry.path.match(/\.(png|gif|jpg|jpeg|bmp|ico|svg)$/i) && entry.path.includes(' ')) {
        console.log(' ', entry.path);
    }
}

// Check what images are referenced in some content pages
console.log('\n=== Image references in sample pages ===');
const pages = ['/1/100_Handle.c.html', '/Release Notes.htm', '/Porting Notes.htm'];
for (const page of pages) {
    try {
        const ui = await chm.resolve(page);
        if (!ui) { console.log(`  ${page}: NOT FOUND`); continue; }
        const data = await chm.retrieve(ui);
        const html = new TextDecoder('utf-8').decode(data);
        const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
        console.log(`  ${page}: ${imgs.length} images:`, imgs.slice(0, 5));
    } catch (e) {
        console.log(`  ${page}: ERROR ${e.message}`);
    }
}

chm.close();
