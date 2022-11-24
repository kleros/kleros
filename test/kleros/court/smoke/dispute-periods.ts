import { expect } from 'chai';
import { ethers } from 'ethers';

import { useDisputeSetup } from 'utils/fixtures/kleros-liquid';
import { Period } from 'utils/index';
import { increaseTime } from 'utils/test-helpers';
import { soliditySha3 } from 'web3-utils';

const NUMBER_OF_CHOICES = 2;

describe('Smoke: Dispute - Peroids', () => {
  it('Should draw jurors in full', async () => {
    const { klerosLiquid, pnk, subcourt, users } = await useDisputeSetup(1);
    const disputeID = 0;
    const numberOfJurors = 1;

    await pnk.generateTokens(users.governor.address, subcourt.minStake);
    await klerosLiquid.setStake(subcourt.ID, subcourt.minStake);

    const minStakingTime = await klerosLiquid.minStakingTime();
    await increaseTime(minStakingTime.toNumber());

    await klerosLiquid.passPhase();
    await klerosLiquid.passPhase();

    await klerosLiquid.drawJurors(disputeID, 3);

    await expect(klerosLiquid.passPeriod(disputeID))
      .to.emit(klerosLiquid, 'NewPeriod')
      .withArgs(disputeID, Period.vote);

    const abi = ethers.utils.defaultAbiCoder;
    const hash = ethers.utils.keccak256(
      abi.encode(['uint[]'], [[NUMBER_OF_CHOICES, numberOfJurors]])
    );

    await klerosLiquid.castVote(
      disputeID,
      [numberOfJurors],
      NUMBER_OF_CHOICES,
      hash
    );
  });
});
