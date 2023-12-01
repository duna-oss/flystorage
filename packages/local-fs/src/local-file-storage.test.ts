import {
    FileInfo,
    FileStorage,
    normalizeExpiryToMilliseconds,
    Visibility
} from '@flystorage/file-storage';
import {BinaryToTextEncoding, createHash} from 'crypto';
import * as path from 'node:path';
import {LocalFileStorage, LocalTemporaryUrlGenerator, LocalTemporaryUrlOptions} from './local-file-storage.js';
import {execSync} from 'child_process';
import {createReadStream, mkdirSync} from 'node:fs';
import {closeReadable} from "@flystorage/file-storage";

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

    test('deleting a file', async () => {
        await storage.write('text.txt', 'contents');

        expect(await storage.fileExists('text.txt')).toEqual(true);

        await storage.deleteFile('text.txt');

        expect(await storage.fileExists('text.txt')).toEqual(false);
    });

    test('deleting a directory', async () => {
        await storage.write('directory/text.txt', 'contents');

        await storage.deleteDirectory('directory');

        expect(await storage.fileExists('directory/text.txt')).toEqual(false);
        expect(await storage.directoryExists('directory')).toEqual(false);
    });

    test('files written with private visibility have private visibility', async () => {
        await storage.write('test.txt', 'contents', {
            visibility: Visibility.PRIVATE,
        });

        const stat = await storage.stat('test.txt');

        expect(stat.visibility).toEqual(Visibility.PRIVATE);
    });

    test('writing a png and fetching its mime-type', async () => {
        const handle = createReadStream(path.resolve(process.cwd(), 'fixtures/screenshot.png'));
        await storage.write('image.png', handle);
        closeReadable(handle);

        const mimeType = await storage.mimeType('image.png');

        expect(mimeType).toEqual('image/png');
    });

    test('retrieving the size of a file', async () => {
        const contents = 'this is the contents of the file';
        await storage.write('something.txt', contents);

        expect(await storage.fileSize('something.txt')).toEqual(contents.length);
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
        expect(listing.map(l => l.path).sort()).toEqual(['file-1.txt', 'file-2.txt']);
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
        expect(listing.map(l => l.type).sort()).toEqual(['directory', 'directory', 'file']);
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

    test('generating a public urls failed when the base URL is undefined', async () => {
        const url = storage.publicUrl('/some/path.txt', {
            baseUrl: undefined
        });

        await expect(url).rejects.toThrow();
    });

    test('generating a temporary URL fails when no generator is configured', async () => {
        await expect(storage.temporaryUrl('path.txt', {
            expiresAt: new Date(),
        })).rejects.toThrow();
    });

    test('generating a temporary URL works when the generator is configured', async () => {
        const storage = new FileStorage(
            new LocalFileStorage(
                rootDirectory,
                {
                    publicUrlOptions: {
                        baseUrl: 'https://default.com/',
                    },
                    temporaryUrlOptions: {
                        baseUrl: 'https://secret.com/'
                    }
                },
                undefined,
                undefined,
                new FakeTemporaryUrlGenerator(),
            ),
        );

        const now = Date.now();

        await expect(storage.temporaryUrl('fake.txt', {
            expiresAt: now,
        })).resolves.toEqual(`https://secret.com/fake.txt?ts=${now}`);
    });

    test('it can calculate checksums', async () => {
        function hashString(input: string, algo: string, encoding: BinaryToTextEncoding = 'hex'): string {
            return createHash(algo).update(input).digest(encoding);
        }

        const contents = 'this is for the checksum';
        await storage.write('path.txt', contents);
        const expectedChecksum = hashString(contents, 'md5');

        const checksum = await storage.checksum('path.txt', {
            algo: 'md5',
        });

        expect(checksum).toEqual(expectedChecksum);
    });
});

class FakeTemporaryUrlGenerator implements LocalTemporaryUrlGenerator {
    async temporaryUrl(path: string, options: LocalTemporaryUrlOptions): Promise<string> {
        return `${options.baseUrl}${path}?ts=${normalizeExpiryToMilliseconds(options.expiresAt)}`;
    }
}