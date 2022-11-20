import { deployments } from 'hardhat';
import {
  EnhancedAppealableArbitrator,
  KlerosGovernor,
} from '../typechain-types';
import { increaseTime } from './test-helpers';

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
    arbitrationFee: ethers.utils.parseEther('0.1'),
    arbitratorExtraData: '0x85',
    appealTimeout: 1200,
    submissionBaseDeposit: ethers.utils.parseEther('0.9'),
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

export const useRulingSetupFixture = deployments.createFixture(async () => {
  const { governor, appeableArbitrator, args, users } = await useSetupFixture();
  const listDescription = 'tx1, tx2, tx3';

  await governor
    .connect(users.submitter1)
    .submitList(
      [governor.address],
      [10],
      '0x246c76df0000000000000000000000000000000000000000000000000000000000000014',
      [36],
      listDescription,
      { value: args.submissionDeposit() }
    );

  await governor
    .connect(users.submitter2)
    .submitList(
      [appeableArbitrator.address],
      [10],
      '0x2462',
      [2],
      listDescription,
      {
        value: args.submissionDeposit(),
      }
    );

  await governor
    .connect(users.submitter3)
    .submitList([], [], '0x24621111', [], listDescription, {
      value: args.submissionDeposit(),
    });

  await increaseTime(args.submissionTimeout + 1);
  await governor.connect(users.deployer).executeSubmissions();

  // Ruling 1 is equal to 0 submission index (submitter1)
  await appeableArbitrator.giveRuling(0, 1);

  return { governor, appeableArbitrator, users, args };
});
