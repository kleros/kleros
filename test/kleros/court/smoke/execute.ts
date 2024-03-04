import { expect } from "chai";
import { BigNumber, BigNumberish } from "ethers";
import { ethers } from "hardhat";

import { useVotedSetup } from "../setups";
import { getJurorsBalances, increaseTime } from "utils/test-helpers";

const disputeID = 0;
const numberOfJurors = 5;
const gasPrice = 100000000;

describe("Smoke: Dispute - Execution", () => {
  it("Should execute penalty/reward distribution", async () => {
    const { klerosLiquid, choices, pnk, jurors } = await useVotedSetup(numberOfJurors);

    await klerosLiquid.passPeriod(disputeID);

    const appealPeriod = await klerosLiquid.appealPeriod(disputeID);
    await increaseTime(appealPeriod.end.toNumber());
    await klerosLiquid.passPeriod(disputeID);

    const voteCount = await klerosLiquid.getVoteCounter(disputeID, 0);
    const coherentCount = voteCount.counts[voteCount.winningChoice.toNumber()];

    const jurorsBalancesBefore = await getJurorsBalances(Array.from(choices.keys()), ethers.provider);

    const jurorsPnkBalancesBefore = await getJurorsBalances(Array.from(choices.keys()), pnk);

    const tx = await klerosLiquid.connect(jurors[0]).execute(disputeID, 0, 2 * numberOfJurors, {
      gasPrice,
    });
    expect(await klerosLiquid.lockInsolventTransfers()).to.be.equal(true);

    const jurorsBalancesAfter = await getJurorsBalances(Array.from(choices.keys()), ethers.provider);

    const jurorsPnkBalancesAfter = await getJurorsBalances(Array.from(choices.keys()), pnk);

    const dispute = await klerosLiquid.getDispute(disputeID);
    const ETHReward = dispute.totalFeesForJurors[0].div(coherentCount);

    //update balance change of the jurors[0] due to tx fee
    const receipt = await tx.wait();
    const txFee = receipt.gasUsed.mul(gasPrice);

    jurorsBalancesBefore.set(jurors[0].address, jurorsBalancesBefore.get(jurors[0].address)?.sub(txFee) as BigNumber);

    for (const [juror, _] of jurorsBalancesBefore) {
      const jurorChoice = choices.get(juror) as BigNumberish;

      voteCount.winningChoice.eq(jurorChoice) &&
        expect(jurorsBalancesAfter.get(juror)).to.equal(jurorsBalancesBefore.get(juror)?.add(ETHReward));

      expect((await klerosLiquid.jurors(juror)).lockedTokens).to.be.equal(0);
      expect(jurorsPnkBalancesAfter.get(juror)).to.be.equal(jurorsPnkBalancesBefore.get(juror));
    }
  });
});
