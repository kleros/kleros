import { expect } from 'chai';
import { Period } from 'utils/enums';
import { useVotedSetup } from '../setups';

describe('Smoke: Dispute - Appeal', () => {
  it('Should appeal the ruling of a dispute', async () => {
    const disputeID = 0;
    const numberOfJurors = 5;
    const { klerosLiquid, jurors } = await useVotedSetup(numberOfJurors);

    await klerosLiquid.passPeriod(disputeID);
    const appealFee = await klerosLiquid.appealCost(disputeID, '0x00');

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
