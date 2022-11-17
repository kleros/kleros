import { HardhatUserConfig } from 'hardhat/types';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import '@typechain/hardhat';

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.4.24',
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
      {
        version: '0.4.26',
        settings: {
          optimizer: {
            enabled: true,
            runs: 100,
          },
        },
      },
    ],
  },
  namedAccounts: {
    deployer: 0,
  },
  paths: {
    sources: 'src',
  },
  networks: {
    hardhat: {
      live: false,
      saveDeployments: true,
      allowUnlimitedContractSize: true,
      tags: ['test', 'local'],
    },
    localhost: {
      url: `http://127.0.0.1:8545`,
      chainId: 31337,
      saveDeployments: true,
      tags: ['test', 'local'],
    },
  },
};
export default config;
