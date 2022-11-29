import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { TwoPartyArbitrable } from "typechain-types";
import { Period, Status } from "utils/enums";
import { setup } from "./setups";
import { PartyTxFees } from "utils/interfaces";
import { execute, generageExtradata, getRandomNumber, getVoteIDs, increaseTime } from "utils/test-helpers";

const NUMBER_OF_JURORS = 5;
const NUMBER_OF_CHOICES = 2;
const PARTY_A_WINS = 1;
const PARTY_B_WINS = 2;

const txFeesPartyA: PartyTxFees = {
  arbitration: BigNumber.from(0),
  appeal: BigNumber.from(0),
  evidenceSumbission: BigNumber.from(0),
};
const txFeesPartyB = Object.assign({}, txFeesPartyA);

describe("KlerosLiquid: Full Dispute Cycle", () => {
  it("Should resolve dispute", async () => {
    const { klerosLiquid, pnk, subcourt } = await setup();
    const extraData = generageExtradata(subcourt.ID, NUMBER_OF_JURORS);

    const signers = (await ethers.getSigners()).slice(0, 3 * NUMBER_OF_JURORS + 2);
    const jurors = signers.slice(0, 3 * NUMBER_OF_JURORS);
    const [partyA, partyB] = signers.slice(jurors.length);

    const arbitrableFactory = await ethers.getContractFactory("TwoPartyArbitrable", jurors[0]);
    const arbitrable = (await arbitrableFactory
      .connect(partyA)
      .deploy(klerosLiquid.address, 0, partyB.address, NUMBER_OF_CHOICES, extraData, "0x00")) as TwoPartyArbitrable;

    const arbitrationCost = await klerosLiquid.arbitrationCost(extraData);

    const balanceBeforePartyA = await ethers.provider.getBalance(partyA.address);
    txFeesPartyA.arbitration = await execute(arbitrable, "payArbitrationFeeByPartyA", arbitrationCost, partyA);

    const balanceBeforePartyB = await ethers.provider.getBalance(partyB.address);
    txFeesPartyB.arbitration = await execute(arbitrable, "payArbitrationFeeByPartyB", arbitrationCost, partyB);

    const disputeID = await arbitrable.disputeID();
    let dispute = await klerosLiquid.disputes(disputeID);

    // Staking Phase
    for (let juror of Object.values(jurors)) {
      await pnk.generateTokens(juror.address, subcourt.minStake);
      await klerosLiquid.connect(juror).setStake(subcourt.ID, subcourt.minStake);
    }

    let minStakingTime = await klerosLiquid.minStakingTime();
    await increaseTime(minStakingTime.toNumber());

    await klerosLiquid.passPhase();
    await klerosLiquid.passPhase();

    // Drawing Phase
    await increaseTime(subcourt.timesPerPeriod[Period.evidence]);
    let tx = await klerosLiquid.drawJurors(disputeID, NUMBER_OF_JURORS);

    // Voting Period
    await klerosLiquid.passPeriod(disputeID);

    const choices = new Map<string, number>();
    let voteIDs = await getVoteIDs(tx);

    voteIDs.forEach((_, juror) => choices.set(juror, getRandomNumber(2) + 1));

    for (const juror of Object.values(jurors)) {
      const voteId = Number(voteIDs.get(juror.address));
      const choice = Number(choices.get(juror.address));

      if (voteIDs.has(juror.address)) await klerosLiquid.connect(juror).castVote(disputeID, [voteId], choice, 0);
    }

    // Appeal period
    await klerosLiquid.passPeriod(disputeID);
    const appealFee = await klerosLiquid.appealCost(disputeID, extraData);

    txFeesPartyA.appeal = await execute(arbitrable, "appeal", appealFee, partyA, [extraData]);

    // Evidence Period
    txFeesPartyA.evidenceSumbission = await execute(arbitrable, "submitEvidence", BigNumber.from(0), partyA, ["0x00"]);

    txFeesPartyB.evidenceSumbission = await execute(arbitrable, "submitEvidence", BigNumber.from(0), partyB, ["0x01"]);

    let disputesWithoutJurors = await klerosLiquid.disputesWithoutJurors();
    expect(disputesWithoutJurors).to.be.equal(1);

    const disputeInfo = await klerosLiquid.getDispute(disputeID);
    const jurorsInNewRound = disputeInfo.votesLengths[disputeInfo.votesLengths.length - 1];
    tx = await klerosLiquid.drawJurors(disputeID, jurorsInNewRound);

    disputesWithoutJurors = await klerosLiquid.disputesWithoutJurors();
    expect(disputesWithoutJurors).to.be.equal(0);

    // Voting Period
    await increaseTime(subcourt.timesPerPeriod[Period.vote]);
    await klerosLiquid.passPeriod(disputeID);

    voteIDs = await getVoteIDs(tx);
    voteIDs.forEach((_, juror) => choices.set(juror, getRandomNumber(2) + 1));

    for (const juror of Object.values(jurors)) {
      const voteId = Number(voteIDs.get(juror.address));
      const choice = Number(choices.get(juror.address));

      if (voteIDs.has(juror.address)) await klerosLiquid.connect(juror).castVote(disputeID, [voteId], choice, 0);
    }

    // Appeal Period: No one appeals
    await increaseTime(subcourt.timesPerPeriod[Period.appeal]);
    await klerosLiquid.passPeriod(disputeID);

    // Execution Period
    await increaseTime(subcourt.timesPerPeriod[Period.appeal]);
    await klerosLiquid.passPeriod(disputeID);

    const ruling = await klerosLiquid.currentRuling(disputeID);
    await expect(klerosLiquid.executeRuling(disputeID))
      .to.emit(arbitrable, "Ruling")
      .withArgs(klerosLiquid.address, disputeID, ruling);

    dispute = await klerosLiquid.disputes(disputeID);
    expect(dispute.ruled).to.be.equal(true);

    const status = await klerosLiquid.disputeStatus(disputeID);
    expect(status).to.be.equal(Status.solved);

    const partyAFee = await arbitrable.partyAFee();
    const partyBFee = await arbitrable.partyBFee();
    const balanceAfterPartyA = await ethers.provider.getBalance(partyA.address);
    const balanceAfterPartyB = await ethers.provider.getBalance(partyB.address);

    if (ruling.eq(PARTY_A_WINS)) {
      expect(balanceAfterPartyA).to.be.equal(
        balanceBeforePartyA
          .sub(txFeesPartyA.arbitration)
          .sub(appealFee)
          .sub(txFeesPartyA.appeal)
          .sub(txFeesPartyA.evidenceSumbission)
      );

      expect(balanceAfterPartyB).to.be.equal(
        balanceBeforePartyB.sub(partyBFee).sub(txFeesPartyB.arbitration).sub(txFeesPartyB.evidenceSumbission)
      );
    }

    if (ruling.eq(PARTY_B_WINS)) {
      expect(balanceAfterPartyB).to.be.equal(
        balanceBeforePartyB.sub(txFeesPartyB.arbitration).sub(txFeesPartyB.evidenceSumbission)
      );

      expect(balanceAfterPartyA).to.be.equal(
        balanceBeforePartyA
          .sub(partyAFee)
          .sub(appealFee)
          .sub(txFeesPartyA.arbitration)
          .sub(txFeesPartyA.appeal)
          .sub(txFeesPartyA.evidenceSumbission)
      );
    }
  });
});
