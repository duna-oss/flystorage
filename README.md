# Flystorage

Flystorage is a file storage abstraction for NodeJS and TypeScript. It is an 80/20 solution
that is built around a set of goals:

- Application code should not be aware WHERE files are stored.
- Pragmatically smooth over underlying storage differences.
- Provide an async/await based API, promises all the way.
- Maximise cross-implementation portability.

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
import {FileStorage} from '@flystorage/file-storage';
import {LocalFileStorage} from '@flystorage/local-file-storage';

```