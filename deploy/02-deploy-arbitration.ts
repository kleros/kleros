import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

import { BigNumber } from 'ethers';

const HARDHAT_CHAIN_ID = 31337;
const argsByChainId = {
  5: {
    governor: '',
    pinakion: '0xA3B02bA6E10F55fb177637917B1b472da0110CcC',
    RNG: '0xCd444af85127392cB84b8583a82e6aE6230Ec0b9',
    minStakingTime: 60,
    maxDrawingTime: 600,
    hiddenVotes: false,
    minStake: 500,
    alpha: 10000,
    feeForJuror: BigNumber.from(10).pow(17),
    jurorsForCourtJump: 511,
    timesPerPeriod: [30, 600, 600, 600],
    sortitionSumTreeK: 4,
  },
  31337: {
    governor: '',
    pinakion: '',
    RNG: '',
    minStakingTime: 60,
    maxDrawingTime: 600,
    hiddenVotes: false,
    minStake: 500,
    alpha: 10000,
    feeForJuror: BigNumber.from(10).pow(17),
    jurorsForCourtJump: 511,
    timesPerPeriod: [30, 600, 600, 600],
    sortitionSumTreeK: 4,
  },
};

const deployKlerosLiquid: DeployFunction = async function(
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const { AddressZero } = hre.ethers.constants;
  const { deployer } = await getNamedAccounts();

  const SortitionSumTreeLibrary = await deployments.get(
    'SortitionSumTreeFactory'
  );

  const chainId = Number(await getChainId());
  if (chainId === HARDHAT_CHAIN_ID) {
    const RNGenerator = await deploy('ConstantNG', {
      from: deployer,
      args: [10],
      log: true,
    });
    const pnk = await deploy('MiniMeTokenERC20', {
      from: deployer,
      args: [AddressZero, AddressZero, 0, 'Pinakion', 18, 'PNK', true],
      log: true,
    });
    argsByChainId[chainId].RNG = RNGenerator.address;
    argsByChainId[chainId].pinakion = pnk.address;
  }

  argsByChainId[chainId].governor = deployer;
  await deploy('KlerosLiquid', {
    from: deployer,
    libraries: {
      SortitionSumTreeFactory: SortitionSumTreeLibrary.address,
    },
    args: Object.values(argsByChainId[chainId]),
    log: true,
  });
};

deployKlerosLiquid.tags = ['KlerosLiquid'];
deployKlerosLiquid.dependencies = ['SortitionSumTreeLibrary'];
export default deployKlerosLiquid;
