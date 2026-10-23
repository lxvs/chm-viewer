import { ChmFile, chmReaderFromFile } from 'chmlib-ts';

const chmPath = '/home/mutton/repo/chm-viewer/OakStreamCrb.chm';
const reader = chmReaderFromFile(chmPath);
const chm = await ChmFile.open(reader);

// Replicate the fixed getFileContent logic
async function getFileContent(filePath) {
    const path = filePath.replace(/\\/g, '/');
    let normalized;
    try {
        normalized = decodeURIComponent(path);
    } catch {
        normalized = path;
    }
    if (!normalized.startsWith('/')) {
        normalized = '/' + normalized;
    }
    normalized = normalized.split('#')[0].split('?')[0];
    try {
        const ui = await chm.resolve(normalized);
        if (!ui) return null;
        const data = await chm.retrieve(ui);
        const ext = normalized.substring(normalized.lastIndexOf('.')).toLowerCase();
        const mime = ext === '.jpg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : 'application/octet-stream';
        return { data, mime };
    } catch {
        return null;
    }
}

// Test 1: URL-encoded paths (Release Notes / Porting Notes)
console.log('=== Test 1: URL-encoded link paths ===');
const encodedPaths = ['/Release%20Notes.htm', '/Porting%20Notes.htm'];
for (const path of encodedPaths) {
    const result = await getFileContent(path);
    console.log(`  ${path}: ${result ? `✓ found (${result.data.length} bytes, ${result.mime})` : '✗ NOT FOUND'}`);
}

// Test 2: Plain paths (images)
console.log('\n=== Test 2: Plain image paths ===');
const imagePaths = ['/ami.jpg', '/doxygen.svg', '/NDA.jpg', '/Key_dir_chm.jpg'];
for (const path of imagePaths) {
    const result = await getFileContent(path);
    console.log(`  ${path}: ${result ? `✓ found (${result.data.length} bytes, ${result.mime})` : '✗ NOT FOUND'}`);
}

// Test 3: Path with literal % (robustness check)
console.log('\n=== Test 3: Malformed percent-encoding robustness ===');
const malformed = '/100%.html';
const result = await getFileContent(malformed);
console.log(`  ${malformed}: ${result ? `✓ found` : '✗ not found (gracefully handled, no crash)'}`);

// Test 4: Backslash paths (CHM internal format)
console.log('\n=== Test 4: Backslash paths ===');
const backslashPath = '\\Release Notes.htm';
const result2 = await getFileContent(backslashPath);
console.log(`  ${backslashPath}: ${result2 ? `✓ found` : '✗ NOT FOUND'}`);

chm.close();
console.log('\n=== All fix verifications complete! ===');
