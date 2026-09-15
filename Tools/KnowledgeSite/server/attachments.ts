import { imageSize } from "image-size";
import { randomUUID } from "node:crypto";
import { Failure } from "../shared/model.ts";
import type { Attachment } from "../shared/model.ts";
import { hash } from "./files.ts";
function animationBudget(data: Buffer, type: string, canvasPixels: number) {
  let frames = 1;
  let pixels = canvasPixels;
  if (type === "png") {
    for (let at = 8; at + 12 <= data.length;) {
      const length = data.readUInt32BE(at);
      if (at + length + 12 > data.length) throw new Failure("PNG 块不完整");
      if (data.toString("ascii", at + 4, at + 8) === "acTL") {
        if (length < 8) throw new Failure("APNG 控制块无效");
        frames = data.readUInt32BE(at + 8);
        pixels = canvasPixels * frames;
      }
      at += length + 12;
    }
  } else if (type === "webp") {
    frames = 0;
    pixels = 0;
    for (let at = 12; at + 8 <= data.length;) {
      const length = data.readUInt32LE(at + 4);
      if (at + length + 8 > data.length) throw new Failure("WebP 块不完整");
      if (data.toString("ascii", at, at + 4) === "ANMF") {
        frames++;
        pixels += canvasPixels;
      }
      at += 8 + length + (length % 2);
    }
  } else if (type === "gif") {
    if (data.length < 13) throw new Failure("GIF 头不完整");
    let at = 13 + (data[10] & 128 ? 3 * 2 ** ((data[10] & 7) + 1) : 0);
    frames = 0;
    pixels = 0;
    const skipBlocks = () => {
      while (at < data.length) {
        const size = data[at++];
        if (!size) return;
        at += size;
        if (at > data.length) throw new Failure("GIF 数据块不完整");
      }
      throw new Failure("GIF 缺少结束数据块");
    };
    while (at < data.length) {
      const marker = data[at++];
      if (marker === 0x3b) break;
      if (marker === 0x21) {
        at++;
        skipBlocks();
      } else if (marker === 0x2c) {
        if (at + 9 > data.length) throw new Failure("GIF 图像描述不完整");
        frames++;
        pixels += Math.max(
          canvasPixels,
          data.readUInt16LE(at + 4) * data.readUInt16LE(at + 6),
        );
        const flags = data[at + 8];
        at += 9 + (flags & 128 ? 3 * 2 ** ((flags & 7) + 1) : 0);
        at++;
        skipBlocks();
      } else throw new Failure("GIF 块格式无效");
    }
  }
  if (frames > 200 || pixels > 40_000_000)
    throw new Failure("动画最多 200 帧且累计解码像素不超过 4000 万");
}
export function validateAttachment(
  data: Buffer,
  name: string,
  description: string,
  previous?: string,
): Attachment {
  if (data.length > 50 * 1024 * 1024 || data.length < 8)
    throw new Failure("附件必须小于等于 50 MiB，且不能是空文件");
  if (!name || name.length > 240 || /[\x00-\x1f\\/:]/.test(name))
    throw new Failure("附件名称无效");
  let mime: string;
  if (data.subarray(0, 5).toString() === "%PDF-") {
    if (
      !data
        .subarray(Math.max(0, data.length - 2048))
        .toString("latin1")
        .includes("%%EOF")
    )
      throw new Failure("PDF 缺少结束标记");
    mime = "application/pdf";
  } else {
    let dimensions;
    try {
      dimensions = imageSize(data);
    } catch {
      throw new Failure("无法识别的图片内容");
    }
    const mimes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
    };
    if (
      !dimensions.type ||
      !(dimensions.type in mimes) ||
      !dimensions.width ||
      !dimensions.height ||
      dimensions.width * dimensions.height > 40_000_000 ||
      dimensions.width > 16384 ||
      dimensions.height > 16384
    )
      throw new Failure(
        "仅允许 PNG/JPEG/GIF/WebP，最多 4000 万像素、单边 16384",
      );
    mime = mimes[dimensions.type];
    animationBudget(
      data,
      dimensions.type,
      dimensions.width * dimensions.height,
    );
  }
  return {
    format: 1,
    id: randomUUID(),
    name,
    description: description.slice(0, 10000),
    mime,
    bytes: data.length,
    digest: hash(data),
    createdAt: new Date().toISOString(),
    ...(previous ? { previous } : {}),
  };
}
