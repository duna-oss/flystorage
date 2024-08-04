const {FileStorage} = require('@flystorage/file-storage');
const {LocalStorageAdapter} = require('@flystorage/local-fs');

describe('running inside jest', () => {
    test('testing it', async () => {
        const fs = new FileStorage(
            new LocalStorageAdapter(
                `${__dirname}/files`,
            ),
        );

        await fs.write('jest/file.txt', 'contents');

        const listing = await fs.list('jest').toArray();

        expect(listing.length).toBe(1);
    })
})