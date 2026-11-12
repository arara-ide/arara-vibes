const { copyFile, rename, chmod } = require('node:fs/promises');
const { join } = require('node:path');

module.exports = async ({ appOutDir }) => {
  const executable = join(appOutDir, 'arara-vibes');
  await rename(executable, `${executable}.bin`);
  await copyFile(join(__dirname, 'linux-launcher.sh'), executable);
  await chmod(executable, 0o755);
};
