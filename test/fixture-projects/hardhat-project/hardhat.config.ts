// We load the plugin here.
import '../../../src/index';

import {HardhatUserConfig} from 'hardhat/types';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.7.3',
  },
  defaultNetwork: 'hardhat',
  networks: {
    tron: {
      url: `http://127.0.0.1:9090/jsonrpc`,
      tron: true,
    },
  },
};

export default config;
