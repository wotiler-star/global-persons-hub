// S3 兼容对象存储上传器（AWS S3 / Cloudflare R2 / 阿里云 OSS / 腾讯云 COS / MinIO）。
// 零依赖：用 fetch + node:crypto 的 SigV4 签名直接 PUT 对象。
//
// 配置（仅 UPLOADER_DRIVER=s3 时需要）：
//   S3_ENDPOINT     存储桶基址（虚拟主机风格已含桶名），如
//                   - R2:   https://<bucket>.<accountid>.r2.cloudflarestorage.com
//                   - AWS:  https://<bucket>.s3.<region>.amazonaws.com
//                   - OSS:  https://<bucket>.oss-cn-hangzhou.aliyuncs.com
//                   - MinIO(path-style): https://minio.example.com
//   S3_REGION       区域；R2 用 'auto'，AWS 用 us-east-1 等
//   S3_BUCKET       桶名（path-style 模式必填）
//   S3_ACCESS_KEY / S3_SECRET_KEY  密钥
//   S3_PATH_STYLE   1=路径风格（MinIO/OSS 兼容）；默认 0=虚拟主机风格
//   S3_PUBLIC_BASE  公开访问基址（可选；不填则回退到 S3_ENDPOINT + key）
import type { Uploader } from './index.js';
import { signS3Request } from './sigv4.js';

export class S3Uploader implements Uploader {
  driver = 's3' as const;
  private endpoint = (process.env.S3_ENDPOINT || '').replace(/\/$/, '');
  private region = process.env.S3_REGION || 'auto';
  private bucket = process.env.S3_BUCKET || '';
  private accessKey = process.env.S3_ACCESS_KEY || '';
  private secretKey = process.env.S3_SECRET_KEY || '';
  private pathStyle = (process.env.S3_PATH_STYLE || '0') === '1';
  private publicBase = (process.env.S3_PUBLIC_BASE || '').replace(/\/$/, '');

  private objectUrl(key: string): string {
    if (this.pathStyle) return `${this.endpoint}/${this.bucket}/${key}`;
    return `${this.endpoint}/${key}`;
  }

  private publicUrl(key: string): string {
    if (this.publicBase) return `${this.publicBase}/${key}`;
    return this.objectUrl(key);
  }

  async put(
    filename: string,
    data: Buffer,
    contentType: string
  ): Promise<{ url: string }> {
    const url = this.objectUrl(filename);
    const host = new URL(url).host;
    const uri = this.pathStyle ? `/${this.bucket}/${filename}` : `/${filename}`;
    const { headers } = signS3Request({
      accessKey: this.accessKey,
      secretKey: this.secretKey,
      region: this.region,
      method: 'PUT',
      host,
      uri,
      body: data,
      headers: { 'content-type': contentType },
    });

    const res = await fetch(url, { method: 'PUT', headers, body: new Uint8Array(data) });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`S3 PUT 失败 ${res.status}: ${txt.slice(0, 200)}`);
    }
    return { url: this.publicUrl(filename) };
  }
}
