// 当 @xenova/transformers 未安装时，保证 tsc 对动态 import 通过类型检查。
// 运行时由 embedding/index.ts 的 try/catch 兜底为哈希嵌入器。
declare module '@xenova/transformers';
