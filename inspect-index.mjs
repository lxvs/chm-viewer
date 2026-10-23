import { ChmFile, chmReaderFromFile } from 'chmlib-ts';

const chmPath = '/home/mutton/repo/chm-viewer/OakStreamCrb.chm';
const reader = chmReaderFromFile(chmPath);
const chm = await ChmFile.open(reader);

const indexUi = await chm.resolve('/index.html');
const indexData = await chm.retrieve(indexUi);
const html = new TextDecoder('utf-8').decode(indexData);
console.log(html);

chm.close();
