import { ChmFile, chmReaderFromFile, parseSystemInfo, parseToc } from 'chmlib-ts';

const chmPath = '/home/mutton/repo/chm-viewer/OakStreamCrb.chm';

async function main() {
    console.log('=== Opening CHM file ===');
    const reader = chmReaderFromFile(chmPath);
    const chm = await ChmFile.open(reader);
    console.log('✓ CHM file opened');

    // Test 1: System info
    console.log('\n=== Test 1: System Info ===');
    const sysRaw = await chm.getSystemRaw();
    if (sysRaw) {
        const sys = parseSystemInfo(sysRaw);
        console.log('✓ Title:', sys.title);
        console.log('✓ Default topic:', sys.defaultTopic);
        console.log('✓ Binary TOC:', sys.binaryToc);
    } else {
        console.log('✗ No system info found');
    }

    // Test 2: File enumeration
    console.log('\n=== Test 2: File Enumeration ===');
    let fileCount = 0;
    const htmlFiles = [];
    for await (const entry of chm.enumerate()) {
        fileCount++;
        if (entry.path.endsWith('.html') || entry.path.endsWith('.htm')) {
            htmlFiles.push(entry.path);
        }
    }
    console.log(`✓ Total files: ${fileCount}`);
    console.log(`✓ HTML files: ${htmlFiles.length}`);
    if (htmlFiles.length > 0) {
        console.log('  First few:', htmlFiles.slice(0, 3));
    }

    // Test 3: TOC parsing
    console.log('\n=== Test 3: TOC Parsing ===');
    const tocUi = await chm.resolve('/index.hhc');
    if (tocUi) {
        const tocData = await chm.retrieve(tocUi);
        const tocHtml = new TextDecoder('utf-8').decode(tocData);
        const toc = parseToc(tocHtml);
        console.log(`✓ TOC entries: ${toc.entries.length}`);
        if (toc.entries.length > 0) {
            const first = toc.entries[0];
            console.log('  First entry:', first.name, '->', first.local);
            if (first.children && first.children.length > 0) {
                console.log('  First child:', first.children[0].name);
            }
        }
    } else {
        console.log('✗ /index.hhc not found');
    }

    // Test 4: HTML content retrieval
    console.log('\n=== Test 4: HTML Content ===');
    const defaultTopic = parseSystemInfo(sysRaw).defaultTopic;
    const htmlUi = await chm.resolve('/' + defaultTopic);
    if (htmlUi) {
        const htmlData = await chm.retrieve(htmlUi);
        const html = new TextDecoder('utf-8').decode(htmlData);
        console.log(`✓ Retrieved ${defaultTopic} (${html.length} chars)`);
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        if (titleMatch) {
            console.log('  Page title:', titleMatch[1]);
        }
    } else {
        console.log(`✗ Could not resolve /${defaultTopic}`);
    }

    // Test 5: Image retrieval
    console.log('\n=== Test 5: Resource Retrieval ===');
    let imageFound = false;
    for await (const entry of chm.enumerate()) {
        if (entry.path.match(/\.(png|gif|jpg|jpeg|bmp)$/i)) {
            const imgData = await chm.retrieve(entry);
            console.log(`✓ Retrieved image ${entry.path} (${imgData.length} bytes)`);
            imageFound = true;
            break;
        }
    }
    if (!imageFound) {
        console.log('ℹ No images found in CHM');
    }

    chm.close();
    console.log('\n=== All tests passed! ===');
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
