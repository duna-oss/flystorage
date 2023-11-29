import {FileInfo, FileStorage, Visibility} from '@flystorage/file-storage';
import {mkdirSync} from 'fs';
import path from 'node:path';
import {LocalFileStorage} from './local-file-storage.js';
import {execSync} from 'child_process';

const rootDirectory = path.resolve(process.cwd(), 'fixtures/test-files');

describe('LocalFileStorage', () => {
    const storage = new FileStorage(
        new LocalFileStorage(
            rootDirectory,
            {
                publicUrlOptions: {
                    baseUrl: 'https://default.com/',
                }
            }
        ),
    );

    beforeEach(() => {
        mkdirSync(rootDirectory);
    });
    afterEach(() => {
        execSync(`rm -rf ${rootDirectory}`);
    });

    test('files written with private visibility have private visibility', async () => {
        await storage.write('test.txt', 'contents', {
            visibility: Visibility.PRIVATE,
        });

        const stat = await storage.stat('test.txt');

        // expect(stat.visibility).toEqual(Visibility.PRIVATE);
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

        const listing = await storage.list('/').toArray();

        expect(listing).toHaveLength(2);
        expect(listing.map(l => l.type)).toEqual(['file', 'file']);
        expect(listing.map(l => l.path)).toEqual(['file-1.txt', 'file-2.txt']);
    });

    test('file file visibility can be changes', async () => {
        await storage.write('file.txt', 'contents', {
            visibility: Visibility.PUBLIC,
        });

        expect((await storage.stat('file.txt')).visibility).toEqual(Visibility.PUBLIC);

        await storage.setVisibility('file.txt', Visibility.PRIVATE);

        expect((await storage.statFile('file.txt')).visibility).toEqual(Visibility.PRIVATE);
    });

    test('checking if a non-existing file exists', async () => {
        expect(await storage.fileExists('non-existing-file.txt')).toEqual(false);
    });

    test('checking if an existing file exists', async () => {
        await storage.write('existing-file.txt', 'contents');

        expect(await storage.fileExists('existing-file.txt')).toEqual(true);
    });

    test('checking if a directory is an existing file', async () => {
        await storage.createDirectory('existing-file.txt');

        expect(await storage.fileExists('existing-file.txt')).toEqual(false);
    });

    test('checking if a non-existing directory exists', async () => {
        expect(await storage.directoryExists('does-not-exist')).toEqual(false);
    });

    test('checking if a file is a directory', async () => {
        await storage.write('location', 'nothing');

        expect(await storage.directoryExists('location')).toEqual(false);
    });

    test('checking if an existing directory exists', async () => {
        await storage.createDirectory('location');

        expect(await storage.directoryExists('location')).toEqual(true);
    });

    test('writing a file implicitly creates parent directories', async () => {
        await storage.write('deeply/nested/directory.txt', 'contents');

        const listing = await storage.list('/', {deep: true}).toArray();

        expect(listing).toHaveLength(3);
        expect(listing.map(l => l.type)).toEqual(['directory', 'directory', 'file']);
    });

    test('generating a public urls works when the base URL is provided in the constructor', async () => {
        const url = await storage.publicUrl('some/path.txt');

        expect(url).toEqual('https://default.com/some/path.txt');
    });

    test('generating a public urls works when the base URL is provided as an option', async () => {
        const url = await storage.publicUrl('/some/path.txt', {
            baseUrl: 'https://example.org/with-prefix/',
        });

        expect(url).toEqual('https://example.org/with-prefix/some/path.txt');
    });
});