<img src="https://raw.githubusercontent.com/duna-oss/flystorage/main/flystorage.svg" width="50px" height="50px" />

# Flystorage adapter for AWS S3

This package contains the Flystorage adapter for Google Cloud Storage

## Installation

Install all the required packages

```bash
npm install --save @flystorage/file-storage @flystorage/google-cloud-storage @google-cloud/storage
```

## Usage

```typescript
import {FileStorage} from '@flystorage/file-storage';
import {GoogleCloudStorageStorageAdapter} from '@flystorage/google-cloud-storage';
import {Storage} from '@google-cloud/storage';

const client = new Storage();
const bucket = client.bucket('{bucket-name}}', {
    userProject: '{user-project}}',
});
const adapter = new GoogleCloudStorageStorageAdapter(bucket, {
    prefix: '{optional-path-prefix}',
});
const storage = new FileStorage(adapter);
```

> ⚠️ Always use the FileStorage, it is essential for security and a good developer
> experience. Do not use the adapter directly.

## Visibility

Setting an retrieving visibility is only meaningful for legacy buckets. To use this functionality
with Flystorage, pass the legacy visibility handling to the constructor:

```typescript
import {GoogleCloudStorageStorageAdapter, LegacyVisibilityHandling} from '@flystorage/google-cloud-storage';

const adapter = new GoogleCloudStorageStorageAdapter(bucket, {
    prefix: '{optional-path-prefix}',
}, new LegacyVisibilityHandling(
    'allUsers', // acl entity, optional
    'publicRead', // acl for Visibility.PUBLIC, optional,
    'projectPrivate', // acl for Visibility.PRIVATE, optional,
));
```

