const { build } = require('../package.json');

module.exports = {
  ...build,
  extends: null,
  productName: 'AraraVibes',
  afterPack: 'scripts/linux-after-pack.cjs',
  linux: {
    ...build.linux,
    executableName: 'arara-vibes',
    icon: 'build/icons',
    desktop: { Name: 'Arara Vibes', StartupWMClass: 'Arara Vibes' },
  },
  deb: {
    ...build.deb,
    afterInstall: 'scripts/linux-after-install.sh',
    afterRemove: 'scripts/linux-after-remove.sh',
  },
};
