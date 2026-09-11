import * as workerThreads from "node:worker_threads";
const wt = workerThreads as typeof workerThreads & { markAsUncloneable?: (value: unknown) => void };
if (typeof wt.markAsUncloneable !== "function") wt.markAsUncloneable = () => undefined;
// jsdom 30/webidl-conversions 8 expects these Stage-3 ArrayBuffer accessors.
// Node 22 on this host does not expose them yet; define safe false-valued
// accessors only for Jest so production runtime behavior remains untouched.
const abProto = ArrayBuffer.prototype as any;
if (!Object.getOwnPropertyDescriptor(abProto, "resizable")) {
  Object.defineProperty(abProto, "resizable", { configurable: true, get: () => false });
}
const sabProto = typeof SharedArrayBuffer !== "undefined" ? (SharedArrayBuffer.prototype as any) : null;
if (sabProto && !Object.getOwnPropertyDescriptor(sabProto, "growable")) {
  Object.defineProperty(sabProto, "growable", { configurable: true, get: () => false });
}

if (typeof globalThis.File === "undefined") { globalThis.File = class File extends Blob { readonly name: string; readonly lastModified: number; constructor(parts: BlobPart[], name: string, options?: FilePropertyBag){ super(parts, options); this.name=name; this.lastModified=options?.lastModified ?? Date.now(); } } as typeof File; }
