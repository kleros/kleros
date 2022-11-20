import { deployments } from 'hardhat';
import {
  EnhancedAppealableArbitrator,
  KlerosGovernor,
} from '../typechain-types';

export const useSetupFixture = deployments.createFixture(async ({ ethers }) => {
  const [
    deployer,
    submitter1,
    submitter2,
    submitter3,
    submitter4,
    other,
  ] = await ethers.getSigners();

  const args = {
    arbitrationFee: ethers.BigNumber.from(1).pow(17),
    arbitratorExtraData: '0x85',
    appealTimeout: 1200,
    submissionBaseDeposit: ethers.BigNumber.from(9).pow(17),
    submissionTimeout: 3600,
    executionTimeout: 3000,
    withdrawTimeout: 100,
    sharedMultiplier: 5000,
    winnerMultiplier: 2000,
    loserMultiplier: 7000,
    metaEvidenceURI: 'https://metaevidence.io',
    submissionDeposit: () =>
      args.submissionBaseDeposit.add(args.arbitrationFee),
  };

  const arbitratorFactory = await ethers.getContractFactory(
    'EnhancedAppealableArbitrator'
  );
  const appeableArbitrator = (await arbitratorFactory.deploy(
    args.arbitrationFee,
    deployer.address,
    args.arbitratorExtraData,
    args.appealTimeout
  )) as EnhancedAppealableArbitrator;

  await appeableArbitrator.changeArbitrator(appeableArbitrator.address);

  const governorFactory = await ethers.getContractFactory('KlerosGovernor');
  const governor = (await governorFactory.deploy(
    appeableArbitrator.address,
    args.arbitratorExtraData,
    args.submissionBaseDeposit,
    args.submissionTimeout,
    args.executionTimeout,
    args.withdrawTimeout,
    args.sharedMultiplier,
    args.winnerMultiplier,
    args.loserMultiplier
  )) as KlerosGovernor;

  await governor.setMetaEvidence(args.metaEvidenceURI);

  return {
    appeableArbitrator,
    governor,
    args,
    users: { deployer, submitter1, submitter2, submitter3, submitter4, other },
  };
});

export const useListSubmissionFixture = deployments.createFixture(async () => {
  const { governor, appeableArbitrator, args, users } = await useSetupFixture();
  const listDescription = 'tx1, tx2, tx3';

  await governor
    .connect(users.submitter1)
    .submitList([governor.address], [10], '0xfdea', [2], listDescription, {
      value: args.submissionDeposit(),
    });

  return { governor, appeableArbitrator, users, args };
});
