import { expect } from 'chai';

import { setup, useDisputeSetup } from 'utils/fixtures/kleros-liquid';
import { Period, Status } from 'utils/index';

const NUMBER_OF_CHOICES = 2;

describe('Smoke: Dispute - Construction', () => {
  it('Should create dispute', async () => {
    const { klerosLiquid, users } = await setup();

    const arbitrationCost = await klerosLiquid.arbitrationCost('0x00');
    await expect(
      klerosLiquid.createDispute(NUMBER_OF_CHOICES, '0x00', {
        value: arbitrationCost,
      })
    )
      .to.emit(klerosLiquid, 'DisputeCreation')
      .withArgs(0, users.governor.address);
  });

  it('Should set correct values', async () => {
    const { klerosLiquid, subcourtTree, users } = await useDisputeSetup();

    const disputeInfo = await klerosLiquid.disputes(0);

    expect(disputeInfo.subcourtID).to.be.equal(subcourtTree.children[0].ID);
    expect(disputeInfo.arbitrated).to.be.equal(users.governor.address);
    expect(disputeInfo.numberOfChoices).to.be.equal(NUMBER_OF_CHOICES);
    expect(disputeInfo.period).to.be.equal(Period.evidence);
    expect(disputeInfo.ruled).to.be.equal(false);

    const status = await klerosLiquid.disputeStatus(0);
    expect(status).to.be.equal(Status.waiting);

    const disputesWithoutJurors = await klerosLiquid.disputesWithoutJurors();
    expect(disputesWithoutJurors).to.be.equal(1);
  });
});
