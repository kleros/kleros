import { expect } from "chai";

import { useRulingSetup } from "utils/fixtures/kleros-governor";
import { increaseTime } from "utils/test-helpers";

describe("Smoke: Governor - Submission Rulling", () => {
  const MULTIPLIER_DIVISOR = 10000;
  it("Should enforce a correct ruling to the dispute with no appeals", async () => {
    const { governor, appeableArbitrator, args, users } = await useRulingSetup();

    // Ruling 1 is equal to 0 submission index (submitter1)
    await appeableArbitrator.giveRuling(0, 1);

    await increaseTime(args.appealTimeout + 1);

    const latestSession = await governor.getCurrentSessionNumber();
    let sessionInfo = await governor.sessions(latestSession);

    await expect(() => appeableArbitrator.giveRuling(sessionInfo.disputeID, 1)).to.changeEtherBalances(
      [users.submitter1, users.submitter2, users.submitter3],
      [sessionInfo.sumDeposit, 0, 0]
    );

    sessionInfo = await governor.sessions(0);
    expect(sessionInfo.ruling).to.equal(1);

    const submission = await governor.submissions(0);
    expect(submission.submitter).to.equal(users.submitter1.address);
    expect(submission.approved).to.equal(true);
  });

  it("Should enforce a correct ruling to the dispute after appeal", async () => {
    const { governor, appeableArbitrator, args, users } = await useRulingSetup();

    // Ruling 1 is equal to 0 submission index (submitter1)
    await appeableArbitrator.giveRuling(0, 1);

    const latestSession = await governor.getCurrentSessionNumber();
    let sessionInfo = await governor.sessions(latestSession);

    // Appeal fee is the same as arbitration fee for this arbitrator
    const loserAppealFee = args.arbitrationFee.add(
      args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
    );
    await governor.connect(users.submitter2).fundAppeal(1, {
      value: loserAppealFee,
    });

    const winnerAppealFee = args.arbitrationFee.add(
      args.arbitrationFee.mul(args.winnerMultiplier).div(MULTIPLIER_DIVISOR)
    );
    await governor.connect(users.submitter1).fundAppeal(0, {
      value: winnerAppealFee,
    });

    // Change the ruling in favor of submitter2.
    await appeableArbitrator.giveRuling(1, 2);
    await increaseTime(args.appealTimeout + 1);

    await expect(() => appeableArbitrator.giveRuling(1, 2)).to.changeEtherBalances(
      [users.submitter1, users.submitter2, users.submitter3],
      [0, sessionInfo.sumDeposit, 0]
    );

    sessionInfo = await governor.sessions(latestSession);
    expect(sessionInfo.ruling).to.equal(2);

    const submission = await governor.submissions(1);
    expect(submission.approved).to.equal(true);
    expect(submission.submitter).to.equal(users.submitter2.address);
  });

  it("Should change the ruling if loser paid appeal fees while the winner did not", async () => {
    const { governor, appeableArbitrator, args, users } = await useRulingSetup();

    // Ruling 1 is equal to 0 submission index (submitter1)
    await appeableArbitrator.giveRuling(0, 1);

    const latestSession = await governor.getCurrentSessionNumber();
    let sessionInfo = await governor.sessions(latestSession);

    const loserAppealFee = args.arbitrationFee.add(
      args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
    );

    await governor.connect(users.submitter2).fundAppeal(1, {
      value: loserAppealFee,
    });

    const shadowWinner = await governor.shadowWinner();
    expect(shadowWinner).to.equal(1);

    await increaseTime(args.appealTimeout + 1);
    await appeableArbitrator.giveRuling(sessionInfo.disputeID, 1);

    const losingList = await governor.submissions(0);
    expect(losingList.approved).to.equal(false);

    const winningList = await governor.submissions(1);
    expect(winningList.approved).to.equal(true);

    sessionInfo = await governor.sessions(latestSession);
    expect(sessionInfo.ruling).to.equal(2);
  });

  it("Should register payments correctly and withdraw correct fees if dispute had winner/loser", async () => {
    const { governor, appeableArbitrator, args, users } = await useRulingSetup();

    await appeableArbitrator.giveRuling(0, 3);

    const loserAppealFee = args.arbitrationFee.add(
      args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
    );

    const winnerAppealFee = args.arbitrationFee.add(
      args.arbitrationFee.mul(args.winnerMultiplier).div(MULTIPLIER_DIVISOR)
    );

    await governor.connect(users.submitter1).fundAppeal(0, {
      value: loserAppealFee,
    });

    // Deliberately underpay with 2nd loser to check correct fee distribution.
    await governor.connect(users.submitter2).fundAppeal(1, {
      value: args.arbitrationFee,
    });

    // Winner's fee is crowdfunded.
    await governor.connect(users.other).fundAppeal(2, {
      value: winnerAppealFee.mul(75).div(100),
    });

    await governor.connect(users.submitter3).fundAppeal(2, {
      value: args.submissionDeposit(),
    });

    const roundInfo = await governor.getRoundInfo(0, 0);
    expect(roundInfo.paidFees[0]).to.equal(loserAppealFee);
    expect(roundInfo.hasPaid[0]).to.equal(true);

    expect(roundInfo.paidFees[1]).to.equal(args.arbitrationFee);
    expect(roundInfo.hasPaid[1]).to.equal(false);

    expect(roundInfo.paidFees[2]).to.equal(winnerAppealFee);
    expect(roundInfo.hasPaid[2]).to.equal(true);

    expect(roundInfo.feeRewards).to.equal(winnerAppealFee.add(loserAppealFee).sub(args.arbitrationFee));

    expect(roundInfo.successfullyPaid).to.equal(winnerAppealFee.add(loserAppealFee));

    await appeableArbitrator.giveRuling(1, 3);

    // 2nd loser underpays again in the last round.
    await governor.connect(users.submitter2).fundAppeal(1, {
      value: loserAppealFee.sub(1000),
    });

    await increaseTime(args.appealTimeout + 1);
    await appeableArbitrator.giveRuling(1, 3);

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.submitter1.address, 0, 0, 0)
    ).to.changeEtherBalance(users.submitter1, 0);

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.submitter2.address, 0, 0, 1)
    ).to.changeEtherBalance(users.submitter2, args.arbitrationFee);

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.submitter2.address, 0, 1, 1)
    ).to.changeEtherBalance(users.submitter2, loserAppealFee.sub(1000));

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.submitter3.address, 0, 0, 2)
    ).to.changeEtherBalance(users.submitter3, roundInfo.feeRewards.mul(25).div(100));

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.other.address, 0, 0, 2)
    ).to.changeEtherBalance(users.other, roundInfo.feeRewards.mul(75).div(100));
  });

  it("Should withdraw correct fees if arbitrator refused to arbitrate", async () => {
    const { governor, appeableArbitrator, args, users } = await useRulingSetup();

    await appeableArbitrator.giveRuling(0, 0);

    const sharedAppealFee = args.arbitrationFee.add(
      args.arbitrationFee.mul(args.sharedMultiplier).div(MULTIPLIER_DIVISOR)
    );

    await governor.connect(users.other).fundAppeal(0, {
      value: sharedAppealFee.mul(2).div(10),
    });

    await governor.connect(users.submitter1).fundAppeal(0, {
      value: args.submissionDeposit().mul(5),
    });

    // Deliberately underpay with 3rd submitter.
    await governor.connect(users.submitter3).fundAppeal(2, {
      value: sharedAppealFee.mul(3).div(10),
    });

    await governor.connect(users.other).fundAppeal(1, {
      value: sharedAppealFee.mul(4).div(10),
    });

    await governor.connect(users.submitter2).fundAppeal(1, {
      value: args.submissionDeposit().mul(2),
    });

    const roundInfo = await governor.getRoundInfo(0, 0);

    await appeableArbitrator.giveRuling(1, 0);
    await increaseTime(args.appealTimeout + 1);
    await appeableArbitrator.giveRuling(1, 0);

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.submitter1.address, 0, 0, 0)
    ).to.changeEtherBalance(users.submitter1, roundInfo.feeRewards.mul(4).div(10));

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.submitter2.address, 0, 0, 1)
    ).to.changeEtherBalance(users.submitter2, roundInfo.feeRewards.mul(3).div(10));

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.submitter3.address, 0, 0, 2)
    ).to.changeEtherBalance(users.submitter3, sharedAppealFee.mul(3).div(10));

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.other.address, 0, 0, 0)
    ).to.changeEtherBalance(users.other, roundInfo.feeRewards.mul(1).div(10));

    await expect(() =>
      governor.connect(users.deployer).withdrawFeesAndRewards(users.other.address, 0, 0, 1)
    ).to.changeEtherBalance(users.other, roundInfo.feeRewards.mul(2).div(10));
  });

  describe("Revert Execution", () => {
    it("Should fail to withdraw fees while dispute is unresolved", async () => {
      const { governor, appeableArbitrator, args, users } = await useRulingSetup();

      await appeableArbitrator.giveRuling(0, 1);

      await governor.connect(users.submitter1).fundAppeal(0, {
        value: args.arbitrationFee,
      });

      await expect(
        governor.connect(users.deployer).withdrawFeesAndRewards(users.submitter1.address, 0, 0, 0)
      ).to.be.revertedWith("Session has an ongoing dispute.");
    });

    it("Should fail to pay appeal fee twice", async () => {
      const { governor, appeableArbitrator, args, users } = await useRulingSetup();

      await appeableArbitrator.giveRuling(0, 1);

      const loserAppealFee = args.arbitrationFee.add(
        args.arbitrationFee.mul(args.loserMultiplier).div(MULTIPLIER_DIVISOR)
      );

      await governor.connect(users.submitter2).fundAppeal(1, {
        value: loserAppealFee,
      });

      await expect(governor.connect(users.submitter2).fundAppeal(1, { value: loserAppealFee })).to.be.revertedWith(
        "Appeal fee has already been paid."
      );
    });

    it("Should fail to pay appeal fee after appeal timeout", async () => {
      const { governor, appeableArbitrator, args, users } = await useRulingSetup();

      await appeableArbitrator.giveRuling(0, 1);

      await increaseTime(args.appealTimeout + 1);

      await expect(governor.connect(users.submitter2).fundAppeal(1, { value: args.arbitrationFee })).to.be.revertedWith(
        "Appeal fees must be paid within the appeal period."
      );
    });
  });
});
