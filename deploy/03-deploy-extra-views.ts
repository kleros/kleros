import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployKlerosLiquidExtraViews: DeployFunction = async function(
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const KlerosLiquid = await deployments.get('KlerosLiquid');

  await deploy('KlerosLiquidExtraViews', {
    from: deployer,
    args: [KlerosLiquid.address],
    log: true,
  });
};

deployKlerosLiquidExtraViews.tags = ['KlerosLiquidExtraViews'];
deployKlerosLiquidExtraViews.dependencies = ['KlerosLiquid'];
export default deployKlerosLiquidExtraViews;
