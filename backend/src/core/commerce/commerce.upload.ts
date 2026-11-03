/**
 * ============================================================================
 * 商品图片文件上传服务（CommerceUploadService）
 * ----------------------------------------------------------------------------
 * 背景：商品图片此前只能通过「HTTPS 外链 URL」录入，本服务补充「本地上传」能力，
 *       让运营者直接上传自有图片，系统落盘后返回站点内的相对 URL，再作为一条
 *       images 记录存入商品。
 *
 * 设计约定（与项目单实例部署方案保持一致）：
 *   - 存储：本地磁盘目录（UPLOAD_DIR，默认 backend/uploads），不依赖对象存储。
 *     单实例 + 独立 MySQL 是当前的生产方案，本地文件与该方案天然匹配；
 *     若未来横向扩容，需替换为 S3 等对象存储并把返回的 URL 换成 CDN 域名。
 *   - 安全：管理员鉴权由控制器层（StoreAdminGuard）保证，本服务只负责文件级校验；
 *     文件名一律重新生成（randomBytes），绝不信任客户端文件名，防止路径穿越与覆盖。
 *   - 类型白名单：仅接受 JPEG / PNG / WebP，且通过文件头「魔数」而非扩展名/声明 MIME
 *     判断真实格式，防止把伪装成图片的可执行文件写到磁盘。
 *   - 大小上限：UPLOAD_MAX_BYTES（默认 5MB），防止撑爆磁盘。
 * ============================================================================
 */

import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { createWriteStream, mkdirSync } from 'fs';
import { extname, join } from 'path';

/** 允许上传的图片格式 → 扩展名映射（键为检测出的真实类型）。 */
const IMAGE_TYPES: Record<string, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
};

/**
 * 通过文件头魔数识别真实图片格式，返回 IMAGE_TYPES 中的键，无法识别返回 null。
 * 判断依据：
 *   - JPEG：FF D8 FF
 *   - PNG ：89 50 4E 47 0D 0A 1A 0A
 *   - WebP：52 49 46 46 .. .. .. .. 57 45 42 50（RIFF .... WEBP）
 */
function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

@Injectable()
export class CommerceUploadService {
  /** 上传目录（绝对路径）；UPLOAD_DIR 可配，默认 backend/uploads。 */
  readonly dir: string;
  /** 单文件大小上限（字节），UPLOAD_MAX_BYTES 可配，默认 5MB。 */
  readonly maxBytes: number;

  constructor() {
    this.dir = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
    const parsed = Number(process.env.UPLOAD_MAX_BYTES ?? 5 * 1024 * 1024);
    this.maxBytes = Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 5 * 1024 * 1024;
    mkdirSync(this.dir, { recursive: true });
  }

  /**
   * 保存一张上传的图片，返回站点内相对 URL（形如 /uploads/xxxx.jpg）。
   *
   * @param file multer 传入的内存文件（buffer + 原始文件名）
   */
  async saveImage(file: { buffer: Buffer; originalname?: string }): Promise<{ url: string; bytes: number }> {
    const buf = file.buffer;
    if (!buf || !buf.length) throw new BadRequestException('Empty file');

    // 大小上限校验（在魔数校验之前，避免对大文件做无谓处理）。
    if (buf.length > this.maxBytes) throw new PayloadTooLargeException(`Image exceeds ${Math.floor(this.maxBytes / 1024 / 1024)}MB limit`);

    // 真实类型识别：既校验格式，又据此决定落盘扩展名，杜绝路径/扩展名伪造。
    const type = sniffImageType(buf);
    if (!type) throw new BadRequestException('Only JPEG, PNG, or WebP images are allowed');

    // 重新生成随机文件名，忽略客户端文件名，避免覆盖与路径穿越。
    const filename = `${Date.now().toString(36)}${randomBytes(8).toString('hex')}${IMAGE_TYPES[type]}`;
    const filepath = join(this.dir, filename);

    // 异步写盘并返回；写失败会抛错并回传 500，不会留下半截引用。
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(filepath, { flags: 'wx' });
      ws.on('error', reject);
      ws.on('finish', () => resolve());
      ws.end(buf);
    });

    return { url: `/uploads/${filename}`, bytes: buf.length };
  }
}
