import { deployments } from "hardhat";
import { KlerosLiquid, MiniMeTokenERC20 } from "typechain-types";

export const useSetupFixture = deployments.createFixture(async ({ ethers }) => {
  const [deployer, other, mock] = await ethers.getSigners();
  const { AddressZero } = ethers.constants;

  const args = {
    governor: deployer.address,
    pinakion: "",
    RNG: "",
    minStakingTime: 60,
    maxDrawingTime: 600,
    hiddenVotes: false,
    minStake: 500,
    alpha: 10000,
    feeForJuror: ethers.BigNumber.from(10).pow(17),
    jurorsForCourtJump: 511,
    timesPerPeriod: [30, 600, 600, 600],
    sortitionSumTreeK: 4,
  };

  const pnkFactory = await ethers.getContractFactory("MiniMeTokenERC20", deployer);
  const pnk = (await pnkFactory.deploy(AddressZero, AddressZero, 0, "Pinakion", 18, "PNK", true)) as MiniMeTokenERC20;
  await pnk.deployed();
  args.pinakion = pnk.address;

  const rngFactory = await ethers.getContractFactory("ConstantNG", deployer);
  const rng = await rngFactory.deploy(10);
  await rng.deployed();
  args.RNG = rng.address;

  const sortitionSumTreeLibraryFactory = await ethers.getContractFactory("SortitionSumTreeFactory", deployer);
  const library = await sortitionSumTreeLibraryFactory.deploy();

  const klerosLiquidFactory = await ethers.getContractFactory("KlerosLiquid", {
    signer: deployer,
    libraries: {
      SortitionSumTreeFactory: library.address,
    },
  });

  const klerosLiquid = (await klerosLiquidFactory.deploy(...Object.values(args))) as KlerosLiquid;
  await klerosLiquid.deployed();

  return { klerosLiquid, rng, pnk, args, users: { deployer, other, mock } };
});
