import {dynamicallyImport} from './index.js';

// @ts-ignore
type FileType = typeof import('file-type');

describe('dynamic-import', () => {
    test('dynamic-import', async () => {
        const fileType = await dynamicallyImport<FileType>('file-type');

        expect(fileType.supportedExtensions.has('jpg')).toEqual(true);
    });
})