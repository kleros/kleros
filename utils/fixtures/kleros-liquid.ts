import { deployments, ethers } from 'hardhat';
import { KlerosLiquid, MiniMeTokenERC20 } from 'typechain-types';
import { SubcourtInfo } from 'utils/interfaces';
import {
  asyncForEach,
  generageExtradata,
  generateSubcourts,
  getRandomNumber,
  getVoteIDs,
  increaseTime,
} from 'utils/test-helpers';

export const useSetupFixture = deployments.createFixture(async ({ ethers }) => {
  const [deployer, other, mock] = await ethers.getSigners();
  const { AddressZero } = ethers.constants;

  const args = {
    governor: deployer.address,
    pinakion: '',
    RNG: '',
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

  const pnkFactory = await ethers.getContractFactory(
    'MiniMeTokenERC20',
    deployer
  );
  const pnk = (await pnkFactory.deploy(
    AddressZero,
    AddressZero,
    0,
    'Pinakion',
    18,
    'PNK',
    true
  )) as MiniMeTokenERC20;
  await pnk.deployed();
  args.pinakion = pnk.address;

  const rngFactory = await ethers.getContractFactory('ConstantNG', deployer);
  const rng = await rngFactory.deploy(10);
  await rng.deployed();
  args.RNG = rng.address;

  const sortitionSumTreeLibraryFactory = await ethers.getContractFactory(
    'SortitionSumTreeFactory',
    deployer
  );
  const library = await sortitionSumTreeLibraryFactory.deploy();

  const klerosLiquidFactory = await ethers.getContractFactory('KlerosLiquid', {
    signer: deployer,
    libraries: {
      SortitionSumTreeFactory: library.address,
    },
  });

  const klerosLiquid = (await klerosLiquidFactory.deploy(
    ...Object.values(args)
  )) as KlerosLiquid;
  await klerosLiquid.deployed();

  return { klerosLiquid, rng, pnk, args, users: { deployer, other, mock } };
});

export const setup = async (subcourtTreeDepth = 2) => {
  await deployments.fixture('KlerosLiquidExtraViews', {
    fallbackToGlobal: true,
    keepExistingDeployments: false,
  });

  const pnk = (await ethers.getContract(
    'MiniMeTokenERC20'
  )) as MiniMeTokenERC20;

  const klerosLiquid = (await ethers.getContract(
    'KlerosLiquid'
  )) as KlerosLiquid;

  const court = await klerosLiquid.courts(0);
  const args = {
    minStake: court.minStake,
    alpha: 10000,
    feeForJuror: ethers.utils.parseEther('1'),
    jurorsForCourtJump: 511,
    timesPerPeriod: [30, 600, 600, 600],
    sortitionSumTreeK: 4,
  };

  const { subcourtMap, subcourtTree } = generateSubcourts(
    subcourtTreeDepth,
    0,
    args
  );

  await asyncForEach(
    (subcourt: SubcourtInfo) =>
      klerosLiquid.createSubcourt(
        subcourt.parent,
        subcourt.hiddenVotes,
        subcourt.minStake,
        subcourt.alpha,
        subcourt.feeForJuror,
        subcourt.jurorsForCourtJump,
        subcourt.timesPerPeriod,
        subcourt.sortitionSumTreeK
      ),
    subcourtMap
  );

  const subcourt = subcourtTree.children[0];
  const [governor, other, mock] = await ethers.getSigners();

  return {
    klerosLiquid,
    pnk,
    subcourtMap,
    subcourtTree,
    subcourt,
    users: { governor, other, mock },
  };
};

export const useDisputeSetup = async (
  numberOfJurors?: number,
  subcourtTreeDepth?: number
) => {
  const { klerosLiquid, pnk, subcourtMap, subcourtTree, users } = await setup(
    subcourtTreeDepth
  );
  const NUMBER_OF_CHOICES = 2;

  const dispute = {
    ID: 0,
    appeals: 0,
    numberOfJurors:
      numberOfJurors || subcourtTree.children[0].jurorsForCourtJump,
    subcourtID: subcourtTree.children[0].ID,
  };

  const extraData = generageExtradata(
    dispute.subcourtID,
    dispute.numberOfJurors
  );

  const arbitrationCost = await klerosLiquid.arbitrationCost(extraData);
  await klerosLiquid.createDispute(NUMBER_OF_CHOICES, extraData, {
    value: arbitrationCost,
  });

  const subcourt = subcourtTree.children[0];

  return {
    klerosLiquid,
    pnk,
    subcourtMap,
    subcourtTree,
    subcourt,
    users,
  };
};

export const useStakedSetup = async (numberOfJurors: number) => {
  const { klerosLiquid, pnk, subcourt } = await useDisputeSetup(numberOfJurors);
  const jurors = (await ethers.getSigners()).slice(0, 2 * numberOfJurors);

  for (let juror of Object.values(jurors)) {
    await pnk.generateTokens(juror.address, subcourt.minStake);
    await klerosLiquid.connect(juror).setStake(subcourt.ID, subcourt.minStake);
  }

  const minStakingTime = await klerosLiquid.minStakingTime();
  await increaseTime(minStakingTime.toNumber());

  await klerosLiquid.passPhase();
  await klerosLiquid.passPhase();

  return { klerosLiquid, subcourt, jurors, pnk };
};

export const useVotedSetup = async (numberOfJurors: number) => {
  const disputeID = 0;
  const choices = new Map<string, number>();
  const { klerosLiquid, pnk, jurors } = await useStakedSetup(numberOfJurors);

  const tx = await klerosLiquid.drawJurors(disputeID, 6);
  await klerosLiquid.passPeriod(disputeID);

  const voteIDs = await getVoteIDs(tx);
  voteIDs.forEach((_, juror) => choices.set(juror, getRandomNumber(2) + 1));

  for (const juror of Object.values(jurors)) {
    const voteId = Number(voteIDs.get(juror.address));
    const choice = Number(choices.get(juror.address));

    if (voteIDs.has(juror.address))
      await klerosLiquid
        .connect(juror)
        .castVote(disputeID, [voteId], choice, 0);
  }

  return { klerosLiquid, jurors, voteIDs, choices, pnk };
};
