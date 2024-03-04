import { expect } from "chai";
import { ethers } from "hardhat";

import { useStakedSetup } from "../setups";
import { getVoteIDs } from "utils/test-helpers";

describe("Smoke: Dispute - Voting", () => {
  const disputeID = 0;
  it("Should validate coherent voting", async () => {
    const numberOfJurors = 3;
    const coherentChoice = 2;
    const { klerosLiquid, jurors } = await useStakedSetup(numberOfJurors);

    const tx = await klerosLiquid.drawJurors(disputeID, 6);
    await klerosLiquid.passPeriod(disputeID);

    const voteIDs = await getVoteIDs(tx);

    for (const juror of Object.values(jurors)) {
      const voteId = Number(voteIDs.get(juror.address));
      if (voteIDs.has(juror.address))
        await klerosLiquid.connect(juror).castVote(disputeID, [voteId], coherentChoice, 0);
    }

    const voteCount = await klerosLiquid.getVoteCounter(disputeID, 0);
    expect(voteCount.counts[coherentChoice]).to.be.equal(voteIDs.size);
    expect(voteCount.winningChoice).to.be.equal(coherentChoice);
    expect(voteCount.tied).to.be.equal(false);

    voteIDs.forEach(async (vid, juror) => {
      const vote = await klerosLiquid.getVote(disputeID, 0, vid);

      expect(vote.account).to.be.equal(juror);
      expect(vote.choice).to.be.equal(coherentChoice);
      expect(vote.commit).to.be.equal(ethers.constants.HashZero);
      expect(vote.voted).to.be.equal(true);
    });
  });

  it("Should validate tied voting", async () => {
    const numberOfJurors = 2;
    const choices = new Map<string, number>();
    const { klerosLiquid, jurors } = await useStakedSetup(numberOfJurors);

    const tx = await klerosLiquid.drawJurors(disputeID, 6);
    await klerosLiquid.passPeriod(disputeID);

    const voteIDs = await getVoteIDs(tx);

    let index = 0;
    voteIDs.forEach((_, juror) => choices.set(juror, index++));

    for (const juror of Object.values(jurors)) {
      const voteId = Number(voteIDs.get(juror.address));
      const choice = Number(choices.get(juror.address));

      if (voteIDs.has(juror.address)) await klerosLiquid.connect(juror).castVote(disputeID, [voteId], choice, 0);
    }

    const voteCount = await klerosLiquid.getVoteCounter(disputeID, 0);
    expect(voteCount.tied).to.be.equal(true);
  });

  describe("Revert Execution", () => {
    it("Should fail voting if any requirement is unmet", async () => {
      const numberOfJurors = 1;
      const { klerosLiquid, jurors } = await useStakedSetup(numberOfJurors);

      await klerosLiquid.drawJurors(disputeID, 6);
      await klerosLiquid.passPeriod(disputeID);

      await expect(klerosLiquid.castVote(disputeID, [], 1, 0), "Vote ID array cannot be empty").to.be.reverted;

      await expect(klerosLiquid.castVote(disputeID, [0], 3, 0)).to.be.revertedWith(
        "The choice has to be less than or equal to the number of choices for the dispute."
      );

      await klerosLiquid.castVote(disputeID, [0], 1, 0);
      await expect(klerosLiquid.castVote(disputeID, [0], 1, 0)).to.be.revertedWith("Vote already cast.");

      await expect(klerosLiquid.connect(jurors[1]).castVote(disputeID, [0], 1, 0)).to.be.revertedWith(
        "The caller has to own the vote."
      );
    });
  });
});
