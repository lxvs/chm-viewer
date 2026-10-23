import { ChmFile, chmReaderFromFile } from 'chmlib-ts';

const chmPath = '/home/mutton/repo/chm-viewer/OakStreamCrb.chm';
const reader = chmReaderFromFile(chmPath);
const chm = await ChmFile.open(reader);

// Check what's in /globals.html and /files.html
for (const page of ['/globals.html', '/files.html', '/annotated.html']) {
    try {
        const ui = await chm.resolve(page);
        if (!ui) { console.log(`${page}: NOT FOUND`); continue; }
        const data = await chm.retrieve(ui);
        const html = new TextDecoder('utf-8').decode(data);
        
        // Find image references
        const imgs = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map(m => m[1]);
        
        // Find CSS references
        const css = [...html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)].map(m => m[1]);
        
        console.log(`\n=== ${page} ===`);
        console.log(`  Images (${imgs.length}):`, imgs.slice(0, 10));
        console.log(`  CSS (${css.length}):`, css.slice(0, 10));
    } catch (e) {
        console.log(`${page}: ERROR ${e.message}`);
    }
}

// Check if common doxygen resources exist
const resources = [
    '/tabs.css', '/navtree.css', '/doxygen.css', 
    '/jquery.js', '/dynsections.js', '/resize.js',
    '/bc_s.png', '/bc_sd.png', '/closed.png', '/open.png', '/bdwn.png',
    '/doxygen.svg', '/ami.jpg', '/NDA.jpg', '/Key_dir_chm.jpg',
    '/navtreedata.js', '/navtree.js', '/clipboard.js', '/doxygen_crawl.html'
];

console.log('\n=== Resource availability ===');
for (const res of resources) {
    try {
        const ui = await chm.resolve(res);
        console.log(`  ${res}: ${ui ? '✓ found' : '✗ not found'}`);
    } catch (e) {
        console.log(`  ${res}: ✗ error`);
    }
}

chm.close();
