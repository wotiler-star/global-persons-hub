// 对象存储抽象层工厂。
// 按 UPLOADER_DRIVER 选择适配器；默认 disk（零依赖）。
// 采用动态 import，使默认的 disk 模式不会加载 s3 相关代码。
export interface Uploader {
  driver: 'disk' | 's3';
  /** 上传二进制并返回可公开访问的 URL。 */
  put(filename: string, data: Buffer, contentType: string): Promise<{ url: string }>;
}

export async function createUploader(): Promise<Uploader> {
  const driver = (process.env.UPLOADER_DRIVER || 'disk').toLowerCase();
  if (driver === 's3') {
    console.log('[uploader] driver = S3-compatible (R2 / AWS / OSS / COS / MinIO)');
    const { S3Uploader } = await import('./s3.js');
    return new S3Uploader();
  }
  console.log('[uploader] driver = disk (default, zero-dependency dev mode)');
  const { DiskUploader } = await import('./disk.js');
  return new DiskUploader();
}
