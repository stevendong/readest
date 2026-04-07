// Stub: S3 storage removed in Phase 1 trimming
export const s3Storage = {
  getDownloadSignedUrl: async (
    _bucket: string,
    _key: string,
    _expires: number,
  ): Promise<string> => {
    throw new Error('S3 not available');
  },
  getUploadSignedUrl: async (
    _bucket: string,
    _key: string,
    _length: number,
    _expires: number,
  ): Promise<string> => {
    throw new Error('S3 not available');
  },
  deleteObject: async (_bucket: string, _key: string): Promise<void> => {
    throw new Error('S3 not available');
  },
};
