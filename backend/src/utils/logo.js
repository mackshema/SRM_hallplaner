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

/** Reads pixel width/height from PNG, JPEG or GIF bytes. Returns null if unknown. */
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
  // JPEG: walk the segments to the first start-of-frame marker
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) { offset++; continue; }
      const marker = buf[offset + 1];
      const length = buf.readUInt16BE(offset + 2);
      const isSOF = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isSOF) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7), type: "jpg" };
      }
      offset += 2 + length;
    }
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
    const match = value.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/s);
    const buffer = Buffer.from(match ? match[1] : value, "base64");
    const size = imageSize(buffer);
    if (!size || !size.width || !size.height) return null; // unsupported format (e.g. SVG/WebP)
    return {
      buffer,
      type: size.type,
      width: size.width,
      height: size.height,
      dataUrl: `data:${MIME_BY_TYPE[size.type]};base64,${buffer.toString("base64")}`,
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
