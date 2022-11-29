import { expect } from 'chai';

import { useDisputeSetup, useStakedSetup } from '../setups';
import { Period } from 'utils/index';
import { getVoteIDs, increaseTime } from 'utils/test-helpers';

const NUMBER_OF_CHOICES = 2;

describe('Smoke: Dispute - Peroids', () => {
  const disputeID = 0;
  it('Should pass periods of dispute', async () => {
    const numberOfJurors = 1;
    const { klerosLiquid } = await useStakedSetup(numberOfJurors);

    await klerosLiquid.drawJurors(disputeID, 3);

    await expect(klerosLiquid.passPeriod(disputeID))
      .to.emit(klerosLiquid, 'NewPeriod')
      .withArgs(disputeID, Period.vote);

    let dispute = await klerosLiquid.disputes(disputeID);
    expect(dispute.period).to.be.equal(Period.vote);

    await klerosLiquid.castVote(disputeID, [0], NUMBER_OF_CHOICES, 0);

    await expect(klerosLiquid.passPeriod(disputeID))
      .to.emit(klerosLiquid, 'NewPeriod')
      .withArgs(disputeID, Period.appeal);

    dispute = await klerosLiquid.disputes(disputeID);
    expect(dispute.period).to.be.equal(Period.appeal);

    const appealPeriod = await klerosLiquid.appealPeriod(disputeID);
    await increaseTime(appealPeriod.end.toNumber());

    await expect(klerosLiquid.passPeriod(disputeID))
      .to.emit(klerosLiquid, 'NewPeriod')
      .withArgs(disputeID, Period.execution);

    dispute = await klerosLiquid.disputes(disputeID);
    expect(dispute.period).to.be.equal(Period.execution);
  });

  describe('Revert Execution', () => {
    const numberOfJurors = 3;
    it('Should fail to pass Evidence Period: period time has not passed', async () => {
      const { klerosLiquid } = await useDisputeSetup(numberOfJurors);

      await expect(klerosLiquid.passPeriod(disputeID)).to.be.revertedWith(
        'The evidence period time has not passed yet and it is not an appeal.'
      );
    });

    it('Should fail to pass Evidence Period: not enough juror drawn', async () => {
      const { klerosLiquid } = await useStakedSetup(numberOfJurors);

      await klerosLiquid.drawJurors(disputeID, numberOfJurors - 1);

      await expect(klerosLiquid.passPeriod(disputeID)).to.be.revertedWith(
        'The dispute has not finished drawing yet.'
      );
    });

    it('Should fail to pass Voting Period: not all jurors voted', async () => {
      const { klerosLiquid, jurors } = await useStakedSetup(numberOfJurors);

      const tx = await klerosLiquid.drawJurors(disputeID, 10);
      await klerosLiquid.passPeriod(disputeID);

      const voteIDs = await getVoteIDs(tx);

      const voteId = Number(voteIDs.get(jurors[0].address));
      await klerosLiquid.castVote(disputeID, [voteId], NUMBER_OF_CHOICES, 0);

      await expect(klerosLiquid.passPeriod(disputeID)).to.be.revertedWith(
        'The vote period time has not passed yet and not every juror has voted yet.'
      );
    });

    it('Should fail to pass Appeal and Execution periods', async () => {
      const { klerosLiquid, subcourt, jurors } = await useStakedSetup(
        numberOfJurors
      );

      const tx = await klerosLiquid.drawJurors(disputeID, 10);
      await klerosLiquid.passPeriod(disputeID);

      const voteIDs = await getVoteIDs(tx);

      for (const juror of Object.values(jurors)) {
        const voteId = Number(voteIDs.get(juror.address));
        if (voteIDs.has(juror.address))
          await klerosLiquid
            .connect(juror)
            .castVote(disputeID, [voteId], NUMBER_OF_CHOICES, 0);
      }

      await klerosLiquid.passPeriod(disputeID);
      await expect(klerosLiquid.passPeriod(disputeID)).to.be.revertedWith(
        'The appeal period time has not passed yet.'
      );

      await increaseTime(subcourt.timesPerPeriod[Period.appeal]);
      await klerosLiquid.passPeriod(disputeID);

      await expect(klerosLiquid.passPeriod(disputeID)).to.be.revertedWith(
        'The dispute is already in the last period.'
      );
    });
  });
});
