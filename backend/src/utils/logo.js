import Settings from "../models/Settings.js";

/**
 * Shared logo handling for every export (Word, Excel, PDF).
 *
 * Logos are uploaded in Settings as data URLs. They're read from Settings at
 * export time, so a changed logo is picked up automatically. Each helper
 * returns null for a missing or unreadable logo, so exports continue without
 * it (no error, no empty placeholder).
 */

const MIME_BY_TYPE = { png: "image/png", jpg: "image/jpeg", gif: "image/gif" };

/** Reads pixel width/height from PNG, JPEG, GIF, or WebP bytes. Returns null if unknown. */
export const imageSize = (buf) => {
  if (!buf || buf.length < 24) return null;
  // PNG: signature + IHDR (width/height big-endian at 16/20)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  }
  // GIF: "GIF8" + little-endian width/height at 6/8
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: "gif" };
  }
  // WebP: RIFF ... WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunkType = buf.toString('ascii', 12, 16);
    if (chunkType === 'VP8 ' && buf.length >= 30) {
      const width = (buf.readUInt16LE(26) & 0x3fff);
      const height = (buf.readUInt16LE(28) & 0x3fff);
      if (width && height) return { width, height, type: "png" }; // export as png mime
    } else if (chunkType === 'VP8L' && buf.length >= 25) {
      const b1 = buf[21], b2 = buf[22], b3 = buf[23], b4 = buf[24];
      const width = 1 + (((b2 & 0x3f) << 8) | b1);
      const height = 1 + (((b4 & 0xf) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6));
      if (width && height) return { width, height, type: "png" };
    } else if (chunkType === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      if (width && height) return { width, height, type: "png" };
    }
    return { width: 100, height: 100, type: "png" };
  }
  // JPEG: walk the segments to the first start-of-frame marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset < buf.length - 8) {
      if (buf[offset] !== 0xff) { offset++; continue; }
      while (offset < buf.length && buf[offset] === 0xff) offset++;
      if (offset >= buf.length) break;
      const marker = buf[offset++];
      // Standalone markers with no length
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      if (offset + 2 > buf.length) break;
      const length = buf.readUInt16BE(offset);
      const isSOF = (marker >= 0xc0 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSOF && offset + 7 <= buf.length) {
        return { height: buf.readUInt16BE(offset + 3), width: buf.readUInt16BE(offset + 5), type: "jpg" };
      }
      offset += length;
    }
    return { width: 100, height: 100, type: "jpg" };
  }
  return null;
};

/**
 * Parses a logo from Settings (a data URL, or bare base64).
 * @returns {{ buffer: Buffer, type: 'png'|'jpg'|'gif', width: number, height: number, dataUrl: string } | null}
 */
export const parseLogo = (value) => {
  if (!value || typeof value !== "string" || !value.trim()) return null;
  try {
    let mimeType = "png";
    let base64Data = value.trim();
    const match = base64Data.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/s);
    if (match) {
      const rawMime = match[1].toLowerCase();
      mimeType = (rawMime === "jpeg" || rawMime === "jpg") ? "jpg" : (rawMime === "gif" ? "gif" : "png");
      base64Data = match[2];
    }
    const buffer = Buffer.from(base64Data, "base64");
    if (!buffer || buffer.length === 0) return null;

    const size = imageSize(buffer) || { width: 100, height: 100, type: mimeType };
    const effectiveType = size.type || mimeType || "png";
    const mimeStr = MIME_BY_TYPE[effectiveType] || "image/png";

    return {
      buffer,
      type: effectiveType,
      width: size.width || 100,
      height: size.height || 100,
      dataUrl: `data:${mimeStr};base64,${buffer.toString("base64")}`,
    };
  } catch (err) {
    console.warn("[LOGO] Could not read logo, exporting without it:", err.message);
    return null;
  }
};

/** Scales (width, height) to fit maxWidth x maxHeight, keeping the aspect ratio. Never upscales. */
export const fitWithin = (width, height, maxWidth, maxHeight) => {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: width * scale, height: height * scale };
};

/** Left/right logos plus institution text, loaded fresh from Settings for one export. */
export const loadBranding = async () => {
  const settings = (await Settings.findOne().lean()) || {};
  return {
    settings,
    institutionName: settings.institutionName || "SRM MADURAI",
    institutionSubtitle: settings.institutionSubtitle || "COLLEGE FOR ENGINEERING AND TECHNOLOGY",
    institutionAffiliation: settings.institutionAffiliation || "",
    examCellName: settings.examCellName || "EXAMINATION CELL",
    academicYear: settings.academicYear || "",
    examName: settings.examName || "",
    leftLogo: parseLogo(settings.leftLogo),
    rightLogo: parseLogo(settings.rightLogo),
  };
};
