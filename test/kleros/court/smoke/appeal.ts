import { expect } from 'chai';
import { Period } from 'utils/enums';

import { useStakedSetup } from 'utils/fixtures/kleros-liquid';
import { getRandomNumber, getVoteIDs } from 'utils/test-helpers';

describe('Smoke: Dispute - Appeal', () => {
  it('Should appeal the ruling of a dispute', async () => {
    const disputeID = 0;
    const numberOfJurors = 5;
    const choices = new Map<string, number>();
    const { klerosLiquid, jurors } = await useStakedSetup(numberOfJurors);

    const tx = await klerosLiquid.drawJurors(disputeID, 6);
    await klerosLiquid.passPeriod(disputeID);

    const voteIDs = await getVoteIDs(tx);

    voteIDs.forEach((_, juror) => choices.set(juror, getRandomNumber(2) + 1));

    console.log({ choices });

    for (const juror of Object.values(jurors)) {
      const voteId = Number(voteIDs.get(juror.address));
      const choice = Number(choices.get(juror.address));

      if (voteIDs.has(juror.address))
        await klerosLiquid
          .connect(juror)
          .castVote(disputeID, [voteId], choice, 0);
    }

    await klerosLiquid.passPeriod(disputeID);
    const appealFee = await klerosLiquid.appealCost(disputeID, '0x00');

    let dispute1 = await klerosLiquid.disputes(disputeID);
    let subcourtID = dispute1.subcourtID;
    console.log(dispute1.subcourtID.toNumber());
    console.log(await klerosLiquid.courts(subcourtID));

    await expect(
      klerosLiquid.appeal(disputeID, '0x00', {
        value: appealFee,
      })
    )
      .to.emit(klerosLiquid, 'AppealDecision')
      .withArgs(disputeID, jurors[0].address);

    expect(await klerosLiquid.disputesWithoutJurors()).to.be.equal(1);

    const dispute = await klerosLiquid.disputes(disputeID);
    expect(dispute.period).to.be.equal(Period.evidence);
    expect(dispute.drawsInRound).to.be.equal(0);
    expect(dispute.ruled).to.be.equal(false);

    const subcourt = await klerosLiquid.courts(dispute.subcourtID);
    const votesLengthByFund = appealFee.div(subcourt.feeForJuror);

    const disputeInfo = await klerosLiquid.getDispute(disputeID);
    expect(disputeInfo.votesLengths[1]).to.be.equal(votesLengthByFund);
    expect(disputeInfo.totalFeesForJurors[1]).to.be.equal(appealFee);
  });
});
