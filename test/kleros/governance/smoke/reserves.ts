import { expect } from "chai";
import { BigNumber, ethers } from "ethers";

import { useInitialSetup } from "utils/fixtures/kleros-governor";
import { increaseTime } from "utils/test-helpers";

describe("Smoke: Governor - Reserves", () => {
  const listDescription = "tx1, tx2, tx3";
  const MULTIPLIER_DIVISOR = 10000;

  it("Should check that funds are tracked correctly", async () => {
    const { governor, appeableArbitrator, users, args } = await useInitialSetup();

    let reservedETH: BigNumber;
    let expendableFunds: BigNumber;

    await governor
      .connect(users.submitter1)
      .submitList(
        [appeableArbitrator.address],
        ["100000000000000000"],
        "0xc13517e1000000000000000000000000000000000000000000000000000000000000000b00000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001fa",
        [101],
        listDescription,
        { value: args.submissionDeposit() }
      );

    await governor
      .connect(users.submitter2)
      .submitList(
        [governor.address],
        [10],
        "0x246c76df0000000000000000000000000000000000000000000000000000000000000014",
        [36],
        listDescription,
        { value: args.submissionDeposit() }
      );

    reservedETH = await governor.reservedETH();
    expect(reservedETH).to.equal(args.submissionDeposit().mul(2));

    const listInfo = await governor.submissions(1);
    await governor.connect(users.submitter2).withdrawTransactionList(1, listInfo.listHash);

    reservedETH = await governor.reservedETH();
    expect(reservedETH).to.equal(args.submissionDeposit());

    // Submit the same list again so we could have a dispute.
    await governor
      .connect(users.submitter2)
      .submitList(
        [governor.address],
        [10],
        "0x246c76df0000000000000000000000000000000000000000000000000000000000000014",
        [36],
        listDescription,
        { value: args.submissionDeposit() }
      );

    await increaseTime(args.submissionTimeout + 1);
    await governor.connect(users.deployer).executeSubmissions();

    reservedETH = await governor.reservedETH();
    expect(reservedETH).to.equal(ethers.utils.parseEther("1.9"));

    await appeableArbitrator.giveRuling(0, 2);

    const loserAppealFee = args.arbitrationFee.add(
      args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
    );

    const winnerAppealFee = args.arbitrationFee.add(
      args.arbitrationFee.mul(args.winnerMultiplier).div(MULTIPLIER_DIVISOR)
    );

    await governor.connect(users.submitter1).fundAppeal(0, {
      value: loserAppealFee,
    });

    reservedETH = await governor.reservedETH();
    expect(reservedETH).to.equal(args.submissionDeposit().mul(2).sub(args.arbitrationFee).add(loserAppealFee));

    await governor.connect(users.other).fundAppeal(1, {
      value: winnerAppealFee,
    });

    reservedETH = await governor.reservedETH();
    expect(reservedETH).to.equal(
      args
        .submissionDeposit()
        .mul(2)
        .sub(args.arbitrationFee)
        .add(loserAppealFee)
        .add(winnerAppealFee)
        .sub(args.arbitrationFee)
    );

    await appeableArbitrator.giveRuling(1, 1);
    await increaseTime(args.appealTimeout + 1);

    const latestSession = await governor.getCurrentSessionNumber();
    const sessionInfo = await governor.sessions(latestSession);

    const reserveBeforeRuling = await governor.reservedETH();
    await appeableArbitrator.giveRuling(1, 1);

    reservedETH = await governor.reservedETH();
    expect(reservedETH).to.equal(reserveBeforeRuling.sub(sessionInfo.sumDeposit));

    expendableFunds = await governor.getExpendableFunds();
    expect(expendableFunds).to.equal(0);

    await governor.connect(users.deployer).withdrawFeesAndRewards(users.submitter1.address, 0, 0, 0);

    reservedETH = await governor.reservedETH();
    expect(reservedETH).to.equal(0);

    const fundingAmount = ethers.utils.parseEther("3");
    await users.other.sendTransaction({
      to: governor.address,
      value: fundingAmount,
    });

    expendableFunds = await governor.getExpendableFunds();
    expect(expendableFunds).to.equal(fundingAmount);

    await governor.connect(users.deployer).executeTransactionList(0, 0, 0);

    expendableFunds = await governor.getExpendableFunds();
    expect(expendableFunds).to.equal(ethers.utils.parseEther("2.9"));
  });
});
