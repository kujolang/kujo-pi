// @ts-check
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";

/** @param {string} path */
export function openRegular(path) {
  const noFollow = constants.O_NOFOLLOW || 0;
  if (!noFollow && !lstatSync(path).isFile()) throw Error("Expected a regular file");
  const fd = openSync(path, constants.O_RDONLY | noFollow | (constants.O_NONBLOCK || 0));
  try {
    const info = fstatSync(fd, { bigint: true });
    if (!info.isFile()) throw Error("Expected a regular file");
    return { fd, info };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

/** @param {string} path @param {number} limit */
export function readRegularBytes(path, limit) {
  const { fd, info } = openRegular(path);
  try {
    if (info.size > limit) throw Error(`File exceeds ${limit} bytes`);
    const buffer = Buffer.alloc(Number(info.size) + 1);
    let used = 0;
    while (used < buffer.length) {
      const count = readSync(fd, buffer, used, buffer.length - used, used);
      if (count === 0) break;
      used += count;
    }
    if (BigInt(used) !== info.size) throw Error("File changed size while reading");
    return buffer.subarray(0, used);
  } finally { closeSync(fd); }
}
