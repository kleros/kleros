import { deployments } from "hardhat";
import { EnhancedAppealableArbitrator, KlerosGovernor } from "typechain-types";
import { PromiseOrValue } from "typechain-types/common";
import { increaseTime } from "../test-helpers";
import { BytesLike } from "ethers";
import { soliditySha3 } from "web3-utils";

export const useInitialSetup = deployments.createFixture(async ({ ethers }) => {
  const [deployer, submitter1, submitter2, submitter3, submitter4, other] = await ethers.getSigners();

  const args = {
    arbitrationFee: ethers.utils.parseEther("0.1"),
    arbitratorExtraData: "0x85",
    appealTimeout: 1200,
    submissionBaseDeposit: ethers.utils.parseEther("0.9"),
    submissionTimeout: 3600,
    executionTimeout: 3000,
    withdrawTimeout: 100,
    sharedMultiplier: 5000,
    winnerMultiplier: 2000,
    loserMultiplier: 7000,
    metaEvidenceURI: "https://metaevidence.io",
    submissionDeposit: () => args.submissionBaseDeposit.add(args.arbitrationFee),
  };

  const arbitratorFactory = await ethers.getContractFactory("EnhancedAppealableArbitrator");
  const appeableArbitrator = (await arbitratorFactory.deploy(
    args.arbitrationFee,
    deployer.address,
    args.arbitratorExtraData,
    args.appealTimeout
  )) as EnhancedAppealableArbitrator;

  await appeableArbitrator.changeArbitrator(appeableArbitrator.address);

  const governorFactory = await ethers.getContractFactory("KlerosGovernor");
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

export const useListSubmissionSetup = deployments.createFixture(async () => {
  const { governor, appeableArbitrator, args, users } = await useInitialSetup();
  const listDescription = "tx1, tx2, tx3";

  await governor.connect(users.submitter1).submitList([governor.address], [10], "0xfdea", [2], listDescription, {
    value: args.submissionDeposit(),
  });

  return { governor, appeableArbitrator, users, args };
});

export const useRulingSetup = deployments.createFixture(async () => {
  const { governor, appeableArbitrator, args, users } = await useInitialSetup();
  const listDescription = "tx1, tx2, tx3";

  await governor
    .connect(users.submitter1)
    .submitList(
      [governor.address],
      [10],
      "0x246c76df0000000000000000000000000000000000000000000000000000000000000014",
      [36],
      listDescription,
      { value: args.submissionDeposit() }
    );

  await governor
    .connect(users.submitter2)
    .submitList([appeableArbitrator.address], [10], "0x2462", [2], listDescription, {
      value: args.submissionDeposit(),
    });

  await governor.connect(users.submitter3).submitList([], [], "0x24621111", [], listDescription, {
    value: args.submissionDeposit(),
  });

  await increaseTime(args.submissionTimeout + 1);
  await governor.connect(users.deployer).executeSubmissions();

  return { governor, appeableArbitrator, users, args };
});

export const useTransactionsSetup = deployments.createFixture(async ({ ethers }) => {
  const { governor, appeableArbitrator, args, users } = await useInitialSetup();

  const listDescription = "tx1, tx2, tx3";
  let index1: number;
  let index2: number;
  let dataString: PromiseOrValue<BytesLike>;

  const addresses = [appeableArbitrator.address, governor.address];
  const values = [ethers.utils.parseEther("0.1"), 0];
  const data = [101, 36];

  const txHash1 = parseInt(
    soliditySha3(
      appeableArbitrator.address,
      ethers.utils.parseEther("0.1").toString(),
      "0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa"
    ) as string,
    16
  );
  const txHash2 = parseInt(
    soliditySha3(
      governor.address,
      0,
      "0x246c76df0000000000000000000000000000000000000000000000000000000000000014"
    ) as string,
    16
  );

  if (txHash1 < txHash2) {
    index1 = 0;
    index2 = 1;
    dataString =
      "0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa246c76df0000000000000000000000000000000000000000000000000000000000000014";
  } else {
    index1 = 1;
    index2 = 0;
    dataString =
      "0x246c76df0000000000000000000000000000000000000000000000000000000000000014c13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa";
  }

  await governor
    .connect(users.submitter1)
    .submitList(
      [addresses[index1], addresses[index2]],
      [values[index1], values[index2]],
      dataString,
      [data[index1], data[index2]],
      listDescription,
      { value: args.submissionDeposit() }
    );

  await increaseTime(args.submissionTimeout + 1);

  await governor.connect(users.deployer).executeSubmissions();

  // Send spendable money via fallback.
  await users.other.sendTransaction({
    to: governor.address,
    value: ethers.utils.parseEther("3"),
  });

  return { governor, appeableArbitrator, users, args };
});
