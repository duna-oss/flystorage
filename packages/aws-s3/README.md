<img src="https://raw.githubusercontent.com/duna-oss/flystorage/main/flystorage.svg" width="50px" height="50px" />

# Flystorage adapter for AWS S3

This package contains the Flystorage adapter for AWS S3 using the V3 SDK.

## Installation

Install all the required packages

```bash
npm install --save @flystorage/file-storage @flystorage/aws-s3 @aws-sdk/client-s3
```

## Usage

```typescript
import {FileStorage} from '@flystorage/file-storage';
import {AwsS3StorageAdapter} from '@flystorage/aws-s3';
import {S3Client} from '@aws-sdk/client-s3';

const client = new S3Client();
const adapter = new AwsS3StorageAdapter(client, {
    bucket: '{your-bucket-name}',
    prefix: '{optional-path-prefix}',
});
const storage = new FileStorage(adapter);
```

> ⚠️ Always use the FileStorage, it is essential for security and a good developer
> experience. Do not use the adapter directly.

