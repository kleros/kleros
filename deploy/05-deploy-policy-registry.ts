import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { DeployFunction } from 'hardhat-deploy/types';

const deployPolicyRegistry: DeployFunction = async function(
  hre: HardhatRuntimeEnvironment
) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const KlerosGovernor = await deployments.get('KlerosGovernor');

  await deploy('PolicyRegistry', {
    from: deployer,
    args: [KlerosGovernor.address],
    log: true,
  });
};

deployPolicyRegistry.tags = ['PolicyRegistry'];
deployPolicyRegistry.dependencies = ['KlerosGovernor'];
export default deployPolicyRegistry;
