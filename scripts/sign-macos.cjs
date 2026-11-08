const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');

exports.default = async function sign(options) {
  const source = process.env.ARARA_CODE_SOURCE || resolve(__dirname, '../../arara-code');
  execFileSync('bash', [resolve(source, 'scripts/sign-macos.sh'), options.app], { stdio: 'inherit' });
};
