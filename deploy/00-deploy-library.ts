import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deploySortitionLibrary: DeployFunction = async function(
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy('SortitionSumTreeFactory', {
    from: deployer,
    log: true,
  });
};

deploySortitionLibrary.tags = ['SortitionSumTreeLibrary'];
export default deploySortitionLibrary;
