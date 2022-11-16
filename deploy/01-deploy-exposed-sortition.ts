import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployExposedSortitionSumTree: DeployFunction = async function(
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const SortitionSumTreeLibrary = await deployments.get(
    'SortitionSumTreeFactory'
  );

  await deploy('ExposedSortitionSumTreeFactory', {
    from: deployer,
    libraries: {
      SortitionSumTreeFactory: SortitionSumTreeLibrary.address,
    },
    log: true,
  });
};

deployExposedSortitionSumTree.tags = ['ExposedSortitionSumTreeFactory'];
deployExposedSortitionSumTree.dependencies = ['SortitionSumTreeLibrary'];
export default deployExposedSortitionSumTree;
