// AWS Signature Version 4 签名助手（零依赖，仅用 node:crypto）。
// 用于对象存储的 PUT/GET 等请求鉴权，兼容 AWS S3、Cloudflare R2、
// 阿里云 OSS（S3 兼容模式）、腾讯云 COS（S3 兼容模式）、MinIO。
import { createHmac, createHash } from 'node:crypto';

export function sha256Hex(input: Buffer | string): string {
  return createHash('sha256').update(input).digest('hex');
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

export interface S3SignInput {
  accessKey: string;
  secretKey: string;
  region: string;
  service?: string; // 默认 's3'
  method: string;
  host: string; // 仅 host，不含 scheme/path，如 bucket.s3.region.amazonaws.com
  uri: string; // 规范 URI，以 '/' 开头，如 /path/key.jpg
  query?: string; // 规范查询串（已编码且按 key 排序），无则 ''
  body: Buffer;
  headers?: Record<string, string>; // 额外需签名的头部（如 content-type）
}

export interface S3SignResult {
  amzDate: string;
  payloadHash: string;
  authorization: string;
  signedHeaders: string;
  headers: Record<string, string>; // 可直接展开到 fetch
}

/** 生成 AWS SigV4 鉴权所需的头部集合。 */
export function signS3Request(input: S3SignInput): S3SignResult {
  const service = input.service ?? 's3';
  const amzDate = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z'); // 2026-07-25T09:12:48.123Z -> 20260725T091248Z
  const datestamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(input.body);

  const headerMap: Record<string, string> = {
    host: input.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(input.headers || {}),
  };
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headerMap)) normalized[k.toLowerCase()] = v.trim();
  const sortedKeys = Object.keys(normalized).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${normalized[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');
  const canonicalRequest = [
    input.method.toUpperCase(),
    input.uri,
    input.query ?? '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const canonicalHash = sha256Hex(canonicalRequest);
  const scope = `${datestamp}/${input.region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, canonicalHash].join('\n');

  const kDate = hmac(`AWS4${input.secretKey}`, datestamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    amzDate,
    payloadHash,
    authorization,
    signedHeaders,
    headers: { ...normalized, authorization },
  };
}
