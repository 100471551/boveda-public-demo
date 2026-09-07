import { createDemoHandler } from '../demo-v2/server/handler.mjs';

let handler;

export default async function demo(req, res) {
  handler ||= createDemoHandler();
  return handler(req, res);
}
