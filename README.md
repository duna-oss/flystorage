# \[WIP\] Flystorage

Flystorage is a file storage abstraction for NodeJS and TypeScript. It is an 80/20 solution
that is built around a set of goals:

- Application code should not be aware WHERE files are stored.
- Pragmatically smooth over underlying storage differences.
- Provide an async/await based API, promises all the way.
- Maximise cross-implementation portability.
- Abstract over file permissions using "visibility".

## Author

Flystorage is built by the maintainer of Flysystem, a filesystem abstract for PHP. This brings
along more than a decade of smoothing over filesystem implementation differences and weighing
trade-offs to make a usable API.

## Usage

Install the main package and any adapters you might need:

```bash
npm i -S @flystorage/file-storage

# for AWS S3
npm i -S @flystorage/aws-s3-file-storage

# for the local filesystem
npm i -S @flystorage/local-file-storage
```

## Local Usage

```typescript
import {resolve} from 'node:path';
import {createReadStream} from 'node:fs';
import {FileStorage, Visibility} from '@flystorage/file-storage';
import {LocalFileStorage} from '@flystorage/local-file-storage';

// SETUP

const rootDirectory = resolve(process.cwd(), 'my-files');
const storage = new FileStorage(new LocalFileStorage(rootDirectory));

// USAGE

# Write using a string
await storage.write('write-from-a-string.txt', 'file contents');

# Write using a stream
const stream = createReadStream(resolve('process.cwd(), 'test-files/picture.png'));
await storage.write('picture.png', stream);

# Write with visibility (permissions).
await storage.write('public.txt', 'debug', {
    visibility: Visibility.PUBLIC, // mode: 0o644
});

await storage.write('private.txt', 'debug', {
    visibility: Visibility.PRIVATE, // mode: 0o644
});
```