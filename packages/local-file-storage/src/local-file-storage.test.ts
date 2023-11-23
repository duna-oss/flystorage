import {FileInfo, FileStorage, Visibility} from '@flystorage/file-storage';
import {mkdirSync} from 'fs';
import path from 'node:path';
import {LocalFileStorage} from './local-file-storage.js';
import {execSync} from 'child_process';

const rootDirectory = path.resolve(process.cwd(), 'fixtures/test-files');

describe('LocalFileStorage', () => {
    const storage = new FileStorage(new LocalFileStorage(rootDirectory));

    beforeEach(() => {
        mkdirSync(rootDirectory);
    });
    afterEach(() => {
        execSync(`rm -rf ${rootDirectory}`);
    });

    test('files written with private visibility have private visibility', async () => {
        await storage.write('test.txt', 'contents', {
            visibility: Visibility.PUBLIC,
        });

        const stat = await storage.stat('test.txt');

        expect(stat.visibility).toEqual(Visibility.PUBLIC);
    });

    describe('stat for (public) files', () => {
        let fileInfo: FileInfo;
        beforeEach(async () => {
            await storage.write('test.txt', 'contents', {
                visibility: Visibility.PUBLIC,
            });

            fileInfo = await storage.statFile('test.txt');
        });

        test('it exposes file size', async () => {
            expect(fileInfo.size).toEqual(8);
        });

        test('it exposes a type', async () => {
            expect(fileInfo.type).toEqual('file');
        });

        test('it exposes (public) visibility', async () => {
            expect(fileInfo.visibility).toEqual(Visibility.PUBLIC);
        });
    });

    test('listing the contents of a directory, shallow', async () => {
        await storage.write('file-1.txt', 'contents');
        await storage.write('file-2.txt', 'contents');

        // const listing = await storage.list('/');
    });
});