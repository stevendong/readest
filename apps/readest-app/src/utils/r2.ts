// Stub: R2 storage removed in Phase 1 trimming
export const r2Storage = {
  getDownloadSignedUrl: async (
    _bucket: string,
    _key: string,
    _expires: number,
  ): Promise<string> => {
    throw new Error('R2 not available');
  },
  getUploadSignedUrl: async (
    _bucket: string,
    _key: string,
    _length: number,
    _expires: number,
  ): Promise<string> => {
    throw new Error('R2 not available');
  },
  deleteObject: async (_bucket: string, _key: string): Promise<void> => {
    throw new Error('R2 not available');
  },
};
