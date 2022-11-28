import { expect } from 'chai';

import { useDisputeSetup } from 'utils/fixtures/kleros-liquid';
import { increaseTime } from 'utils/test-helpers';

describe('Smoke: Dispute - Drawing', () => {
  it('Should draw jurors in full', async () => {
    const { klerosLiquid, pnk, subcourt, users } = await useDisputeSetup(3);
    const disputeID = 0;

    for (let juror of Object.values(users)) {
      await pnk.generateTokens(juror.address, subcourt.minStake);
      await klerosLiquid
        .connect(juror)
        .setStake(subcourt.ID, subcourt.minStake);
    }

    const minStakingTime = await klerosLiquid.minStakingTime();
    await increaseTime(minStakingTime.toNumber());

    await klerosLiquid.passPhase();
    await klerosLiquid.passPhase();

    let disputesWithoutJurors = await klerosLiquid.disputesWithoutJurors();
    expect(disputesWithoutJurors).to.be.equal(1);

    await klerosLiquid.drawJurors(disputeID, 3);

    disputesWithoutJurors = await klerosLiquid.disputesWithoutJurors();
    expect(disputesWithoutJurors).to.be.equal(0);
  });
});
