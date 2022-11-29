import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

import { BigNumber } from "ethers";

const HARDHAT_CHAIN_ID = 31337;
const argsByChainId = {
  1: {
    arbitrator: "",
    extraData:
      "0x00000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000005",
    submissionBaseDeposit: BigNumber.from(41).pow(17),
    submissionTimeout: 626400,
    executionTimeout: 604800,
    withdrawTimeout: 3600,
    sharedMultiplier: 10000,
    winnerMultiplier: 10000,
    loserMultiplier: 20000,
  },
  100: {
    arbitrator: "",
    extraData: "",
    submissionBaseDeposit: "",
    submissionTimeout: "",
    executionTimeout: "",
    withdrawTimeout: "",
    sharedMultiplier: "",
    winnerMultiplier: "",
    loserMultiplier: "",
  },
  5: {
    arbitrator: "",
    extraData:
      "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
    submissionBaseDeposit: BigNumber.from(1).pow(9),
    submissionTimeout: 1000,
    executionTimeout: 1000,
    withdrawTimeout: 1000,
    sharedMultiplier: 10000,
    winnerMultiplier: 10000,
    loserMultiplier: 20000,
  },
  31337: {
    arbitrator: "",
    extraData:
      "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
    submissionBaseDeposit: BigNumber.from(1).pow(9),
    submissionTimeout: 1000,
    executionTimeout: 1000,
    withdrawTimeout: 1000,
    sharedMultiplier: 10000,
    winnerMultiplier: 10000,
    loserMultiplier: 20000,
  },
};

const deployGovernor: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, getChainId } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = Number(await getChainId());

  const KlerosLiquid = await deployments.get("KlerosLiquid");
  argsByChainId[chainId].arbitrator = KlerosLiquid.address;

  await deploy("KlerosGovernor", {
    from: deployer,
    args: Object.values(argsByChainId[chainId]),
    log: true,
  });
};

deployGovernor.tags = ["KlerosGovernor"];
deployGovernor.dependencies = ["KlerosLiquid"];
export default deployGovernor;
