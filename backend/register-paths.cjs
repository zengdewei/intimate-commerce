const Module = require('module');
const path = require('path');
const original = Module._resolveFilename;
// Resolve the existing TypeScript @/ aliases without a production devDependency.
Module._resolveFilename = function (request, parent, ...args) {
  const resolved = request.startsWith('@/') ? path.join(__dirname, 'dist', 'src', request.slice(2)) : request;
  return original.call(this, resolved, parent, ...args);
};
